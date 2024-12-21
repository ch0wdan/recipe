import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, ChefHat } from "lucide-react";
import { type Recipe } from "@db/schema";

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-video relative">
        <img
          src={recipe.imageUrl || "https://images.unsplash.com/photo-1618670708018-33fd57846013"}
          alt={recipe.title}
          className="object-cover w-full h-full"
        />
        <Badge className="absolute top-2 right-2">{recipe.cookwareType}</Badge>
      </div>
      <CardHeader>
        <h3 className="text-lg font-semibold">{recipe.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {recipe.prepTime + recipe.cookTime} mins
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {recipe.servings} servings
          </div>
          <div className="flex items-center gap-1">
            <ChefHat className="h-4 w-4" />
            {recipe.difficulty}
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        {recipe.sourceName && (
          <span>From: {recipe.sourceName}</span>
        )}
      </CardFooter>
    </Card>
  );
}
