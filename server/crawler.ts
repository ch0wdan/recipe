import { JSDOM } from "jsdom";
import { db } from "@db";
import { crawlerConfigs, recipes, type CrawlerConfig } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { log } from "./vite";

interface Selectors {
  recipeLinks: string;
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
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

async function normalizeUrl(url: string, baseUrl: string): Promise<string> {
  try {
    // Handle special cases where URL might be malformed
    const cleanUrl = url.trim().replace(/\s+/g, '');
    if (!cleanUrl) return '';

    // If it's already an absolute URL, just return it
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      return cleanUrl;
    }

    // Handle protocol-relative URLs
    if (cleanUrl.startsWith('//')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}${cleanUrl}`;
    }

    // Handle root-relative URLs
    if (cleanUrl.startsWith('/')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.origin}${cleanUrl}`;
    }

    // Handle relative URLs
    const base = new URL(baseUrl);
    const normalized = new URL(cleanUrl, base);
    return normalized.toString();
  } catch (error) {
    log(`Error normalizing URL ${url} with base ${baseUrl}: ${error}`, "crawler");
    return '';
  }
}

async function findRecipeLinks(document: Document, selector: string, baseUrl: string): Promise<string[]> {
  log(`Looking for recipe links using selector: ${selector}`, "crawler");

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(selector));
  log(`Found ${links.length} potential link elements`, "crawler");

  const recipeLinks = await Promise.all(
    links.map(async (link) => {
      const href = link.href || link.getAttribute("href");
      if (!href) return null;

      try {
        const normalizedUrl = await normalizeUrl(href, baseUrl);
        if (!normalizedUrl) return null;

        // Only keep links that look like recipe pages
        if (normalizedUrl.includes('/recipe') || 
            normalizedUrl.includes('/recipes') ||
            normalizedUrl.includes('cast-iron')) {
          return normalizedUrl;
        }
        return null;
      } catch (e) {
        log(`Invalid URL: ${href}`, "crawler");
        return null;
      }
    })
  );

  const validLinks = recipeLinks.filter((url): url is string => Boolean(url));
  log(`Found ${validLinks.length} valid recipe links`, "crawler");

  // Log a sample of the links found
  if (validLinks.length > 0) {
    log(`Sample recipe links:`, "crawler");
    validLinks.slice(0, 3).forEach(link => log(`- ${link}`, "crawler"));
  }

  return validLinks;
}

async function crawlRecipe(url: string, selectors: Selectors) {
  try {
    log(`Crawling recipe from ${url}`, "crawler");
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // More flexible title selection
    const title = document.querySelector(selectors.title)?.textContent?.trim() ||
                 document.querySelector("h1")?.textContent?.trim();

    // Try multiple approaches for description
    const description = document.querySelector(selectors.description)?.textContent?.trim() ||
                       document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
                       document.querySelector(".recipe-summary")?.textContent?.trim() ||
                       document.querySelector("[itemprop='description']")?.textContent?.trim();

    // Enhanced ingredients extraction
    const ingredients = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.ingredients)
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text))
      .filter(text => text.length > 1); // Filter out single characters

    // Enhanced instructions extraction with fallbacks
    let instructions = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.instructions)
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text));

    // If no instructions found with primary selector, try alternatives
    if (instructions.length === 0) {
      const alternativeSelectors = [
        "ol li",
        ".recipe-method li",
        ".recipe-steps li",
        "[itemprop='recipeInstructions'] li",
        ".preparation-steps li"
      ];

      for (const selector of alternativeSelectors) {
        instructions = Array.from(
          document.querySelectorAll<HTMLElement>(selector)
        )
          .map((el) => el.textContent?.trim())
          .filter((text): text is string => Boolean(text));

        if (instructions.length > 0) {
          log(`Found instructions using alternative selector: ${selector}`, "crawler");
          break;
        }
      }
    }

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

        const response = await fetchWithRetry(config.siteUrl);
        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const validLinks = await findRecipeLinks(document, config.selectors.recipeLinks, config.siteUrl);
        log(`Found ${validLinks.length} valid recipe links on ${config.siteName}`, "crawler");

        let newRecipes = 0;
        let duplicates = 0;

        for (const link of validLinks) {
          await delay(2000); // Ethical crawling delay
          const recipeData = await crawlRecipe(link, config.selectors);

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

    // Common patterns for recipe elements
    const patterns = {
      recipeLinks: [
        "a[href*='recipe']",
        "a[href*='recipes']",
        ".recipe-card a",
        ".recipe-link",
        ".recipe-preview a",
        "article.recipe a",
        "[class*='recipe'] a",
        "a[class*='recipe']",
      ],
      title: [
        "h1[class*='recipe']",
        "h1[class*='title']",
        ".recipe-title",
        ".recipe-name",
        "[class*='recipe-title']",
        "h1",
      ],
      description: [
        "[class*='recipe-description']",
        ".recipe-summary",
        "[class*='description']",
        "meta[name='description']",
        ".recipe-intro",
        "[itemprop='description']",
      ],
      ingredients: [
        "[class*='ingredients'] li",
        ".ingredient-list li",
        ".ingredients li",
        "[itemprop='recipeIngredient']",
        "ul[class*='ingredient'] li",
      ],
      instructions: [
        "[class*='instructions'] li",
        "[class*='steps'] li",
        "[class*='directions'] li",
        "[itemprop='recipeInstructions'] li",
        ".recipe-method li",
        "ol li",
      ],
    };

    // Helper function to find first matching selector with content
    const findFirstMatch = (document: Document, selectors: string[]): string => {
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
      return selectors[0];
    };

    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const selectors = {
      recipeLinks: findFirstMatch(document, patterns.recipeLinks),
      title: findFirstMatch(document, patterns.title),
      description: findFirstMatch(document, patterns.description),
      ingredients: findFirstMatch(document, patterns.ingredients),
      instructions: findFirstMatch(document, patterns.instructions),
    };

    log(`Detected selectors for ${url}:`, "crawler");
    log(JSON.stringify(selectors, null, 2), "crawler");

    const links = await findRecipeLinks(document, selectors.recipeLinks, url);
    let sampleRecipe = null;
    if (links.length > 0) {
      sampleRecipe = await crawlRecipe(links[0], selectors);
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
        recipeLinks: links.length,
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
    siteUrl: "https://www.lodgecastiron.com/recipes",
    selectors: {
      recipeLinks: "a[href*='recipe']",
      title: "h1",
      description: "[class*='description']",
      ingredients: "[class*='ingredients'] li",
      instructions: "[class*='instructions'] li",
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
        .where(eq(crawlerConfigs.siteName, config.siteName))
        .limit(1);

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