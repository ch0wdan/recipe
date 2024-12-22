import { JSDOM } from "jsdom";
import { db } from "@db";
import { crawlerConfigs, recipes, type CrawlerConfig } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { log } from "./vite";

interface Selectors {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  recipeLinks: string;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt} to fetch ${url}`, "crawler");
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      log(`Fetch attempt ${attempt} failed: ${error}`, "crawler");
      if (attempt < maxRetries) {
        await delay(1000 * attempt); // Exponential backoff
      }
    }
  }

  throw lastError;
}

async function detectSelectors(url: string): Promise<Selectors> {
  log(`Analyzing page structure for ${url}`, "crawler");

  try {
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Common patterns for recipe elements
    const patterns = {
      recipeLinks: [
        ".recipe-card__link",
        ".recipe-card a",
        "a[href*='recipe']",
        "a[href*='recipes']",
        ".recipe a",
        ".recipe-preview a",
        "article.recipe a",
        ".post a",
        "[class*='recipe'] a",
        "a[class*='recipe']",
      ],
      title: [
        ".recipe-detail__title",
        "h1[class*='recipe']",
        "h1[class*='title']",
        "h1.recipe-title",
        "h1.entry-title",
        ".recipe-name",
        "[class*='recipe-title']",
        "[class*='recipe-name']",
        "h1",  // Fallback to first h1
      ],
      description: [
        ".recipe-detail__description",
        "[class*='recipe-description']",
        ".recipe-description",
        ".entry-content p:first-of-type",
        ".recipe-summary",
        "[class*='description']",
        ".recipe-intro",
        "meta[name='description']",
        ".content p:first-of-type",  // Fallback to first paragraph
      ],
      ingredients: [
        ".recipe-detail__ingredients-list li",
        ".ingredients-list li",
        ".ingredient-list li",
        ".ingredients li",
        "[class*='ingredient'] li",
        "ul[class*='ingredient'] li",
        "[class*='ingredients'] li",
        "ul li",  // Fallback to any list items
      ],
      instructions: [
        ".recipe-detail__instructions-list li",
        ".instructions-list li",
        ".directions li",
        ".steps li",
        "[class*='instruction'] li",
        "[class*='step'] li",
        "[class*='method'] li",
        "[class*='directions'] li",
        "ol li",  // Fallback to ordered list items
      ],
    };

    // Helper function to find first matching selector with content
    const findFirstMatch = (selectors: string[]): string => {
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0 && Array.from(elements).some(el => el.textContent?.trim())) {
            log(`Found matching selector with content: ${selector}`, "crawler");
            return selector;
          }
        } catch (error) {
          continue;
        }
      }
      return selectors[0]; // Fallback to first pattern if no match found
    };

    const detectedSelectors: Selectors = {
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

async function normalizeUrl(url: string, baseUrl: string): Promise<string> {
  try {
    const base = new URL(baseUrl);
    const normalized = new URL(url, base);
    return normalized.toString();
  } catch (error) {
    log(`Error normalizing URL ${url}: ${error}`, "crawler");
    throw error;
  }
}

async function crawlRecipe(url: string, selectors: Selectors) {
  try {
    log(`Crawling recipe from ${url}`, "crawler");
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const title = document.querySelector(selectors.title)?.textContent?.trim() ||
                 document.querySelector("h1")?.textContent?.trim();

    const description = document.querySelector(selectors.description)?.textContent?.trim() ||
                       document.querySelector("meta[name='description']")?.getAttribute("content")?.trim();

    const ingredients = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.ingredients)
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text));

    const instructions = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.instructions)
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text));

    if (!title || !description || ingredients.length === 0 || instructions.length === 0) {
      log(`Failed to extract required recipe data from ${url}`, "crawler");
      log(`Title: ${title ? "Found" : "Missing"}`, "crawler");
      log(`Description: ${description ? "Found" : "Missing"}`, "crawler");
      log(`Ingredients: ${ingredients.length} found`, "crawler");
      log(`Instructions: ${instructions.length} found`, "crawler");
      return null;
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
  try {
    log("Starting crawler run", "crawler");
    const configs = await db
      .select()
      .from(crawlerConfigs)
      .where(eq(crawlerConfigs.enabled, true));

    log(`Found ${configs.length} enabled crawler configurations`, "crawler");

    for (const config of configs) {
      try {
        log(`Processing crawler for ${config.siteName}`, "crawler");

        let selectorsToUse: Selectors;
        if (!config.selectors || Object.keys(config.selectors).length === 0) {
          log(`No selectors defined for ${config.siteName}, attempting to detect...`, "crawler");
          selectorsToUse = await detectSelectors(config.siteUrl);

          // Update the config with detected selectors
          await db
            .update(crawlerConfigs)
            .set({ selectors: selectorsToUse })
            .where(eq(crawlerConfigs.id, config.id));
        } else {
          selectorsToUse = config.selectors as Selectors;
        }

        const response = await fetchWithRetry(config.siteUrl);
        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const links = document.querySelectorAll<HTMLAnchorElement>(selectorsToUse.recipeLinks);
        log(`Found ${links.length} potential recipe links`, "crawler");

        const recipeLinks = await Promise.all(
          Array.from(links).map(async (link) => {
            const href = link.href || link.getAttribute("href");
            if (!href) return null;
            try {
              return await normalizeUrl(href, config.siteUrl);
            } catch (e) {
              log(`Invalid URL: ${href}`, "crawler");
              return null;
            }
          })
        );

        const validLinks = recipeLinks.filter((url): url is string => Boolean(url));
        log(`Found ${validLinks.length} valid recipe links on ${config.siteName}`, "crawler");

        let newRecipes = 0;
        let duplicates = 0;

        for (const link of validLinks) {
          await delay(2000); // Ethical crawling delay
          const recipeData = await crawlRecipe(link, selectorsToUse);

          if (recipeData) {
            // Check if recipe already exists
            const [existingRecipe] = await db
              .select()
              .from(recipes)
              .where(
                and(
                  eq(recipes.title, recipeData.title),
                  eq(recipes.sourceName, config.siteName)
                )
              )
              .limit(1);

            if (existingRecipe) {
              log(`Skipping duplicate recipe: ${recipeData.title} from ${config.siteName}`, "crawler");
              duplicates++;
              continue;
            }

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
            newRecipes++;
          }
        }

        log(`Crawl summary for ${config.siteName}:`, "crawler");
        log(`- New recipes: ${newRecipes}`, "crawler");
        log(`- Duplicates skipped: ${duplicates}`, "crawler");

        await db
          .update(crawlerConfigs)
          .set({ lastCrawl: new Date() })
          .where(eq(crawlerConfigs.id, config.id));

        log(`Completed crawl for ${config.siteName}`, "crawler");
      } catch (error) {
        log(`Failed to crawl ${config.siteName}: ${error}`, "crawler");
        // Continue with next config even if one fails
        continue;
      }
    }
  } catch (error) {
    log(`Crawler execution failed: ${error}`, "crawler");
    throw error;
  }
}

export async function analyzeWebsite(url: string) {
  try {
    log(`Analyzing website: ${url}`, "crawler");
    const selectors = await detectSelectors(url);

    // Test the detected selectors
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const links = document.querySelectorAll<HTMLAnchorElement>(selectors.recipeLinks);
    const recipeLinks = (await Promise.all(
      Array.from(links).map(async (link) => {
        const href = link.href || link.getAttribute("href");
        return href ? normalizeUrl(href, url) : null;
      })
    )).filter((url): url is string => Boolean(url));

    let sampleRecipe = null;
    if (recipeLinks.length > 0) {
      sampleRecipe = await crawlRecipe(recipeLinks[0], selectors);
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

const DEFAULT_CONFIGS = [
  {
    siteName: "Lodge Cast Iron",
    siteUrl: "https://www.lodgecastiron.com/discover/recipes",
    selectors: {
      recipeLinks: ".recipe-card__link",
      title: ".recipe-detail__title",
      description: ".recipe-detail__description",
      ingredients: ".recipe-detail__ingredients-list li",
      instructions: ".recipe-detail__instructions-list li",
    } satisfies Selectors,
    enabled: true,
  },
];

async function initializeCrawlerConfigs() {
  try {
    log("Initializing default crawler configurations", "crawler");
    for (const config of DEFAULT_CONFIGS) {
      const [existing] = await db
        .select()
        .from(crawlerConfigs)
        .where(eq(crawlerConfigs.siteName, config.siteName));

      if (!existing) {
        await db.insert(crawlerConfigs).values(config);
        log(`Created default config for ${config.siteName}`, "crawler");
      }
    }
  } catch (error) {
    log(`Error initializing crawler configs: ${error}`, "crawler");
    throw error;
  }
}