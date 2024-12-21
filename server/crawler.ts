import { JSDOM } from "jsdom";
import { db } from "@db";
import { crawlerConfigs, recipes } from "@db/schema";
import { eq } from "drizzle-orm";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function crawlRecipe(url: string, selectors: any) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const title = document.querySelector(selectors.title)?.textContent?.trim();
    const description = document.querySelector(selectors.description)?.textContent?.trim();
    const ingredients = Array.from(document.querySelectorAll(selectors.ingredients))
      .map(el => el.textContent?.trim())
      .filter(Boolean);
    const instructions = Array.from(document.querySelectorAll(selectors.instructions))
      .map(el => el.textContent?.trim())
      .filter(Boolean);

    if (!title || !description || ingredients.length === 0 || instructions.length === 0) {
      throw new Error("Failed to extract required recipe data");
    }

    return {
      title,
      description,
      ingredients: ingredients as string[],
      instructions: instructions as string[],
      sourceUrl: url,
    };
  } catch (error) {
    console.error(`Failed to crawl recipe from ${url}:`, error);
    return null;
  }
}

export async function runCrawler() {
  const configs = await db.select().from(crawlerConfigs).where(eq(crawlerConfigs.enabled, true));

  for (const config of configs) {
    try {
      const response = await fetch(config.siteUrl);
      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const recipeLinks = Array.from(document.querySelectorAll(config.selectors.recipeLinks))
        .map((link: any) => link.href)
        .filter(Boolean);

      for (const link of recipeLinks) {
        await delay(2000); // Ethical crawling delay
        const recipeData = await crawlRecipe(link, config.selectors);
        
        if (recipeData) {
          await db.insert(recipes).values({
            ...recipeData,
            cookwareType: 'skillet', // Default value
            difficulty: 'medium',
            prepTime: 30,
            cookTime: 30,
            servings: 4,
            sourceName: config.siteName,
          });
        }
      }

      await db
        .update(crawlerConfigs)
        .set({ lastCrawl: new Date() })
        .where(eq(crawlerConfigs.id, config.id));
    } catch (error) {
      console.error(`Failed to crawl ${config.siteName}:`, error);
    }
  }
}
