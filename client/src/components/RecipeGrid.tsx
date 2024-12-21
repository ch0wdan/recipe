import { Link } from "wouter";
import { RecipeCard } from "@/components/RecipeCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Recipe } from "@db/schema";

interface RecipeGridProps {
  recipes: Recipe[];
  isLoading?: boolean;
}

export function RecipeGrid({ recipes, isLoading }: RecipeGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-video w-full" />
            <div className="space-y-2 mt-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">No recipes found</h2>
        <p className="text-muted-foreground">
          Try adjusting your filters or check back later for new recipes.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
          <a className="block transition-transform hover:scale-[1.02]">
            <RecipeCard recipe={recipe} />
          </a>
        </Link>
      ))}
    </div>
  );
}
