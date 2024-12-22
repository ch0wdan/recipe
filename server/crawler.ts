import { JSDOM } from "jsdom";
import { db } from "@db";
import { crawlerConfigs, recipes, type CrawlerConfig } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { log } from "./vite";
import { z } from "zod";

// Updated schema with more flexible validation
export const selectorsSchema = z.object({
  recipeLinks: z.string(),
  title: z.string(),
  description: z.string(),
  ingredients: z.string(),
  instructions: z.string(),
  image: z.string().optional(),
});

type Selectors = z.infer<typeof selectorsSchema>;

// Initial crawler configurations
export const DEFAULT_CONFIGS = [
  {
    siteName: "Lodge Cast Iron",
    siteUrl: "https://www.lodgecastiron.com/recipes",
    selectors: {
      recipeLinks: ".recipe-card a, a[href*='recipe'], a[href*='recipes']",
      title: "h1",
      description: ".recipe-description, meta[name='description']",
      ingredients: ".ingredients-list li, .recipe-ingredients li",
      instructions: ".instructions-list li, .recipe-steps li",
      image: ".recipe-image img, meta[property='og:image']"
    },
    enabled: true,
  },
];

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
        await delay(1000 * attempt);
      }
    }
  }

  throw lastError;
}

async function normalizeUrl(url: string, baseUrl: string): Promise<string> {
  try {
    const cleanUrl = url.trim().replace(/\s+/g, '');
    if (!cleanUrl) return '';

    if (cleanUrl.startsWith('data:')) {
      return cleanUrl;
    }

    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      return cleanUrl;
    }

    if (cleanUrl.startsWith('//')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}${cleanUrl}`;
    }

    if (cleanUrl.startsWith('/')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.origin}${cleanUrl}`;
    }

    const base = new URL(baseUrl);
    const normalized = new URL(cleanUrl, base);
    return normalized.toString();
  } catch (error) {
    log(`Error normalizing URL ${url} with base ${baseUrl}: ${error}`, "crawler");
    return '';
  }
}

async function findRecipeLinks(document: Document, selector: string, baseUrl: string): Promise<string[]> {
  try {
    log(`Looking for recipe links using selector: ${selector}`, "crawler");
    const links = Array.from(document.querySelectorAll(selector));
    log(`Found ${links.length} potential link elements`, "crawler");

    // Debug the HTML structure
    const parentElement = document.querySelector(selector)?.parentElement;
    if (parentElement) {
      log(`Parent element structure:`, "crawler");
      log(parentElement.outerHTML.slice(0, 500), "crawler");
    }

    const validLinks = new Set<string>();
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      try {
        const normalizedUrl = await normalizeUrl(href, baseUrl);
        if (!normalizedUrl) continue;

        const isRecipeUrl =
          normalizedUrl.toLowerCase().includes('recipe') ||
          normalizedUrl.toLowerCase().includes('recipes');

        if (isRecipeUrl) {
          validLinks.add(normalizedUrl);
          log(`Found valid recipe link: ${normalizedUrl}`, "crawler");
        }
      } catch (err) {
        log(`Error processing link ${href}: ${err}`, "crawler");
      }
    }

    return Array.from(validLinks);
  } catch (error) {
    log(`Error finding recipe links: ${error}`, "crawler");
    return [];
  }
}

async function crawlRecipe(url: string, selectors: Selectors): Promise<any> {
  try {
    log(`Crawling recipe from ${url}`, "crawler");
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Debug HTML structure
    log(`Page HTML structure:`, "crawler");
    log(document.documentElement.outerHTML.slice(0, 1000), "crawler");

    // Try multiple selectors for title
    const titleSelectors = [selectors.title, "h1.recipe-title", "h1.entry-title", "h1"];
    let title: string | undefined;
    for (const selector of titleSelectors) {
      title = document.querySelector(selector)?.textContent?.trim();
      if (title) {
        log(`Found title using selector ${selector}: ${title}`, "crawler");
        break;
      }
    }

    // Try multiple selectors for description
    const descriptionSelectors = [
      selectors.description,
      "meta[name='description']",
      ".recipe-description",
      ".recipe-summary"
    ];
    let description: string | undefined;
    for (const selector of descriptionSelectors) {
      const element = document.querySelector(selector);
      description = element?.getAttribute('content') || element?.textContent?.trim();
      if (description) {
        log(`Found description using selector ${selector}: ${description}`, "crawler");
        break;
      }
    }

    // Try multiple selectors for ingredients
    const ingredientSelectors = [
      selectors.ingredients,
      ".recipe-ingredients li",
      ".ingredients-list li",
      "[itemprop='recipeIngredient']"
    ];
    let ingredients: string[] = [];
    for (const selector of ingredientSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        ingredients = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter((text): text is string => !!text && text.length > 1);
        if (ingredients.length > 0) {
          log(`Found ${ingredients.length} ingredients using selector ${selector}`, "crawler");
          break;
        }
      }
    }

    // Try multiple selectors for instructions
    const instructionSelectors = [
      selectors.instructions,
      ".recipe-instructions li",
      ".recipe-steps li",
      "[itemprop='recipeInstructions'] li"
    ];
    let instructions: string[] = [];
    for (const selector of instructionSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        instructions = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter((text): text is string => !!text && text.length > 5);
        if (instructions.length > 0) {
          log(`Found ${instructions.length} instructions using selector ${selector}`, "crawler");
          break;
        }
      }
    }

    // Try to find image URL
    const imageSelectors = [
      "meta[property='og:image']",
      "meta[name='og:image']",
      ".recipe-image img",
      ".hero-image img",
      "img[itemprop='image']"
    ];
    let imageUrl: string | null = null;
    for (const selector of imageSelectors) {
      const element = document.querySelector(selector);
      if (!element) continue;

      const url = element.tagName.toLowerCase() === 'meta'
        ? element.getAttribute('content')
        : element.getAttribute('src') || element.getAttribute('data-src');

      if (url) {
        imageUrl = await normalizeUrl(url, url);
        if (imageUrl) {
          log(`Found image URL using selector ${selector}: ${imageUrl}`, "crawler");
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
      imageUrl,
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

        const selectors = selectorsSchema.parse(config.selectors);
        const recipeLinks = await findRecipeLinks(document, selectors.recipeLinks, config.siteUrl);
        log(`Found ${recipeLinks.length} valid recipe links on ${config.siteName}`, "crawler");

        for (const link of recipeLinks) {
          await delay(2000); // Ethical crawling delay
          const recipeData = await crawlRecipe(link, selectors);

          if (recipeData) {
            try {
              // Check for duplicates
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

              if (!existingRecipe) {
                await db.insert(recipes).values({
                  ...recipeData,
                  cookwareType: "skillet",
                  difficulty: "medium",
                  prepTime: 30,
                  cookTime: 30,
                  servings: 4,
                  sourceName: config.siteName,
                });
                log(`Successfully saved recipe: ${recipeData.title}`, "crawler");
              } else {
                log(`Skipping duplicate recipe: ${recipeData.title}`, "crawler");
              }
            } catch (error) {
              log(`Error saving recipe ${recipeData.title}: ${error}`, "crawler");
            }
          }
        }

        // Update last crawl timestamp
        await db
          .update(crawlerConfigs)
          .set({ lastCrawl: new Date() })
          .where(eq(crawlerConfigs.id, config.id));

      } catch (error) {
        log(`Failed to crawl ${config.siteName}: ${error}`, "crawler");
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
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Find recipe links
    const linkSelectors = [
      "a[href*='recipe']",
      "a[href*='recipes']",
      ".recipe-card a",
      ".recipe-link",
      "[class*='recipe'] a",
    ];

    let bestLinkSelector = '';
    let maxLinks = 0;

    for (const selector of linkSelectors) {
      try {
        const links = document.querySelectorAll(selector);
        if (links.length > maxLinks) {
          maxLinks = links.length;
          bestLinkSelector = selector;
        }
      } catch (err) {
        continue;
      }
    }

    const selectors = {
      recipeLinks: bestLinkSelector || linkSelectors[0],
      title: "h1.recipe-title, h1.entry-title, h1",
      description: ".recipe-description, .recipe-summary, meta[name='description']",
      ingredients: ".ingredients-list li, .recipe-ingredients li",
      instructions: ".instructions-list li, .recipe-directions li",
      image: ".recipe-image img, .hero-image img, img[class*='recipe'], [itemprop='image'], meta[property='og:image']"
    };

    // Extract domain name for site name
    const siteName = new URL(url).hostname.replace(/^www\./, '').split('.')[0]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Test the selectors
    const recipeLinks = await findRecipeLinks(document, selectors.recipeLinks, url);
    let sampleRecipe = null;
    if (recipeLinks.length > 0) {
      sampleRecipe = await crawlRecipe(recipeLinks[0], selectors);
    }

    return {
      suggestedConfig: {
        siteName,
        siteUrl: url,
        selectors,
        enabled: true,
      },
      sampleData: {
        recipeLinks: recipeLinks.length,
        sampleTitle: sampleRecipe?.title,
        sampleDescription: sampleRecipe?.description,
        sampleIngredients: sampleRecipe?.ingredients,
        sampleInstructions: sampleRecipe?.instructions,
        sampleImageUrl: sampleRecipe?.imageUrl,
      },
    };
  } catch (error) {
    log(`Error analyzing website: ${error}`, "crawler");
    throw error;
  }
}

export async function initializeCrawlerConfigs() {
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