import { JSDOM } from "jsdom";
import { db } from "@db";
import { crawlerConfigs, recipes } from "@db/schema";
import { eq } from "drizzle-orm";
import { log } from "./vite";

interface Selectors {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  recipeLinks: string;
}

const DEFAULT_CONFIGS = [
  {
    siteName: "Lodge Cast Iron",
    siteUrl: "https://www.lodgecastiron.com/discover/recipes",
    selectors: {
      recipeLinks: ".recipe-card a",
      title: "h1.recipe-title",
      description: ".recipe-description",
      ingredients: ".ingredients-list li",
      instructions: ".instructions-list li",
    } as Selectors,
    enabled: true,
  },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function detectSelectors(url: string): Promise<Selectors> {
  log(`Analyzing page structure for ${url}`, "crawler");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Common patterns for recipe elements
    const patterns = {
      recipeLinks: [
        ".recipe-card a", ".recipe a", ".recipe-preview a",
        "article a", ".post a", "[class*='recipe'] a"
      ],
      title: [
        "h1.recipe-title", "h1.entry-title", ".recipe-name",
        "h1[class*='title']", "h1[class*='recipe']"
      ],
      description: [
        ".recipe-description", ".entry-content p", ".recipe-summary",
        "[class*='description']", ".recipe-intro"
      ],
      ingredients: [
        ".ingredients-list li", ".ingredient-list li", ".ingredients li",
        "[class*='ingredient'] li", "ul[class*='ingredient'] li"
      ],
      instructions: [
        ".instructions-list li", ".directions li", ".steps li",
        "[class*='instruction'] li", "[class*='step'] li",
        "[class*='method'] li"
      ]
    };

    // Helper function to find first matching selector
    const findFirstMatch = (selectors: string[], context: Document | Element = document): string => {
      for (const selector of selectors) {
        try {
          const elements = context.querySelectorAll(selector);
          if (elements.length > 0) {
            log(`Found matching selector: ${selector}`, "crawler");
            return selector;
          }
        } catch (error) {
          continue;
        }
      }
      return selectors[0]; // Fallback to first pattern if no match found
    };

    // Find best matching selectors
    const detectedSelectors = {
      recipeLinks: findFirstMatch(patterns.recipeLinks),
      title: findFirstMatch(patterns.title),
      description: findFirstMatch(patterns.description),
      ingredients: findFirstMatch(patterns.ingredients),
      instructions: findFirstMatch(patterns.instructions),
    };

    log(`Detected selectors for ${url}:`, "crawler");
    log(JSON.stringify(detectedSelectors, null, 2), "crawler");

    return detectedSelectors;
  } catch (error) {
    log(`Error detecting selectors: ${error}`, "crawler");
    throw error;
  }
}

async function initializeCrawlerConfigs() {
  for (const config of DEFAULT_CONFIGS) {
    const [existing] = await db
      .select()
      .from(crawlerConfigs)
      .where(eq(crawlerConfigs.siteName, config.siteName));

    if (!existing) {
      await db.insert(crawlerConfigs).values(config);
    }
  }
}


export async function crawlRecipe(url: string, selectors: Selectors) {
  try {
    log(`Crawling recipe from ${url}`, "crawler");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const title = document.querySelector(selectors.title)?.textContent?.trim();
    const description = document
      .querySelector(selectors.description)
      ?.textContent?.trim();
    const ingredients = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.ingredients),
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text));
    const instructions = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.instructions),
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text));

    if (!title || !description || ingredients.length === 0 || instructions.length === 0) {
      log(`Failed to extract required recipe data from ${url}`, "crawler");
      log(`Title: ${title ? "Found" : "Missing"}`, "crawler");
      log(`Description: ${description ? "Found" : "Missing"}`, "crawler");
      log(`Ingredients: ${ingredients.length} found`, "crawler");
      log(`Instructions: ${instructions.length} found`, "crawler");
      throw new Error("Failed to extract required recipe data");
    }

    return {
      title,
      description,
      ingredients,
      instructions,
      sourceUrl: url,
    };
  } catch (error) {
    log(`Failed to crawl recipe from ${url}: ${error}`, "crawler");
    return null;
  }
}

export async function runCrawler() {
  await initializeCrawlerConfigs();
  const configs = await db
    .select()
    .from(crawlerConfigs)
    .where(eq(crawlerConfigs.enabled, true));

  for (const config of configs) {
    try {
      log(`Starting crawl for ${config.siteName}`, "crawler");

      // If selectors are not defined, try to detect them
      if (!config.selectors || Object.keys(config.selectors).length === 0) {
        log(`No selectors defined for ${config.siteName}, attempting to detect...`, "crawler");
        config.selectors = await detectSelectors(config.siteUrl);
      }

      const response = await fetch(config.siteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch site: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const recipeLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(config.selectors.recipeLinks),
      )
        .map((link) => {
          const href = link.href;
          if (!href) return null;
          try {
            return new URL(href, config.siteUrl).toString();
          } catch (e) {
            log(`Invalid URL: ${href}`, "crawler");
            return null;
          }
        })
        .filter((url): url is string => Boolean(url));

      log(`Found ${recipeLinks.length} recipe links on ${config.siteName}`, "crawler");

      for (const link of recipeLinks) {
        await delay(2000); // Ethical crawling delay
        const recipeData = await crawlRecipe(link, config.selectors as Selectors);

        if (recipeData) {
          await db.insert(recipes).values({
            ...recipeData,
            cookwareType: "skillet", // Default value
            difficulty: "medium",
            prepTime: 30,
            cookTime: 30,
            servings: 4,
            sourceName: config.siteName,
          });
          log(`Successfully saved recipe: ${recipeData.title}`, "crawler");
        }
      }

      await db
        .update(crawlerConfigs)
        .set({ lastCrawl: new Date() })
        .where(eq(crawlerConfigs.id, config.id));

      log(`Completed crawl for ${config.siteName}`, "crawler");
    } catch (error) {
      log(`Failed to crawl ${config.siteName}: ${error}`, "crawler");
    }
  }
}

export async function analyzeWebsite(url: string): Promise<{
  suggestedConfig: {
    siteName: string;
    siteUrl: string;
    selectors: Selectors;
  };
  sampleData: {
    recipeLinks: number;
    sampleTitle?: string;
    sampleDescription?: string;
    sampleIngredients?: string[];
    sampleInstructions?: string[];
  };
}> {
  try {
    log(`Analyzing website: ${url}`, "crawler");
    const selectors = await detectSelectors(url);

    // Fetch the page to test the detected selectors
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Get sample data using detected selectors
    const recipeLinks = document.querySelectorAll(selectors.recipeLinks);
    let sampleRecipe = null;

    if (recipeLinks.length > 0) {
      const firstLink = recipeLinks[0] as HTMLAnchorElement;
      if (firstLink.href) {
        const recipeUrl = new URL(firstLink.href, url).toString();
        sampleRecipe = await crawlRecipe(recipeUrl, selectors);
      }
    }

    // Extract domain name for site name
    const siteName = new URL(url).hostname.replace(/^www\./, '').split('.')[0]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return {
      suggestedConfig: {
        siteName,
        siteUrl: url,
        selectors,
      },
      sampleData: {
        recipeLinks: recipeLinks.length,
        sampleTitle: sampleRecipe?.title,
        sampleDescription: sampleRecipe?.description,
        sampleIngredients: sampleRecipe?.ingredients,
        sampleInstructions: sampleRecipe?.instructions,
      },
    };
  } catch (error) {
    log(`Error analyzing website: ${error}`, "crawler");
    throw error;
  }
}