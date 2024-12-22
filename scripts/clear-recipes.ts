
import { db } from "../db";
import { comments, ratings, recipes } from "../db/schema";

async function clearRecipes() {
  // Delete all comments
  await db.delete(comments);
  console.log("Cleared all comments");

  // Delete all ratings 
  await db.delete(ratings);
  console.log("Cleared all ratings");

  // Delete all recipes
  await db.delete(recipes);
  console.log("Cleared all recipes");
}

clearRecipes().catch(console.error);
