import { JSDOM } from "jsdom";
import { db } from "@db";
import { crawlerConfigs, recipes } from "@db/schema";
import { eq } from "drizzle-orm";

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
    },
    enabled: true,
  },
  {
    siteName: "Field Company",
    siteUrl: "https://fieldcompany.com/blogs/journal/tagged/holiday",
    selectors: {
      recipeLinks: ".recipe-preview a",
      title: ".recipe-title",
      description: ".recipe-intro",
      ingredients: ".ingredients-list li",
      instructions: ".instructions-list li",
    },
    enabled: true,
  },
  // Add more sites as needed
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

interface Selectors {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  recipeLinks: string;
}

export async function crawlRecipe(url: string, selectors: Selectors) {
  try {
    console.log(`Crawling recipe from ${url}`);
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch URL: ${response.status} ${response.statusText}`,
      );
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

    if (
      !title ||
      !description ||
      ingredients.length === 0 ||
      instructions.length === 0
    ) {
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
    console.error(`Failed to crawl recipe from ${url}:`, error);
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
      console.log(`Starting crawl for ${config.siteName}`);
      const response = await fetch(config.siteUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CastIronRecipeCrawler/1.0; +https://mycookwarecare.com)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch site: ${response.status} ${response.statusText}`,
        );
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const recipeLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          config.selectors.recipeLinks,
        ),
      )
        .map((link) => {
          const href = link.href;
          if (!href) return null;
          try {
            return new URL(href, config.siteUrl).toString();
          } catch (e) {
            console.error(`Invalid URL: ${href}`);
            return null;
          }
        })
        .filter((url): url is string => Boolean(url));

      console.log(
        `Found ${recipeLinks.length} recipe links on ${config.siteName}`,
      );

      for (const link of recipeLinks) {
        await delay(2000); // Ethical crawling delay
        const recipeData = await crawlRecipe(
          link,
          config.selectors as Selectors,
        );

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
          console.log(`Successfully saved recipe: ${recipeData.title}`);
        }
      }

      await db
        .update(crawlerConfigs)
        .set({ lastCrawl: new Date() })
        .where(eq(crawlerConfigs.id, config.id));

      console.log(`Completed crawl for ${config.siteName}`);
    } catch (error) {
      console.error(`Failed to crawl ${config.siteName}:`, error);
    }
  }
}
