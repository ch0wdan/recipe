import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useUser } from "@/hooks/use-user";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Form } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Star, Clock, Users, ChefHat } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Recipe } from "@db/schema";

export function RecipeDetails() {
  const [, params] = useRoute("/recipes/:id");
  const { user } = useUser();
  const { toast } = useToast();
  const form = useForm({
    defaultValues: {
      content: "",
    },
  });

  const { data: recipe, isLoading } = useQuery<Recipe>({
    queryKey: [`/api/recipes/${params?.id}`],
    enabled: !!params?.id,
  });

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/recipes/${params?.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      form.reset();
      toast({ title: "Comment added successfully" });
    },
  });

  const ratingMutation = useMutation({
    mutationFn: async (rating: number) => {
      const response = await fetch(`/api/recipes/${params?.id}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Rating submitted successfully" });
    },
  });

  if (isLoading || !recipe) {
    return (
      <div className="container py-8">
        <Card className="max-w-4xl mx-auto">
          <CardContent className="py-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <Card className="max-w-4xl mx-auto">
        <div className="aspect-video relative">
          <img
            src={recipe.imageUrl || "https://images.unsplash.com/photo-1618670708018-33fd57846013"}
            alt={recipe.title}
            className="object-cover w-full h-full"
          />
        </div>

        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">{recipe.title}</h1>
              <p className="text-muted-foreground">{recipe.description}</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
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
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-8">
            <div>
              <h2 className="text-xl font-semibold mb-4">Ingredients</h2>
              <ul className="list-disc pl-6 space-y-2">
                {recipe.ingredients.map((ingredient, i) => (
                  <li key={i}>{ingredient}</li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Instructions</h2>
              <ol className="list-decimal pl-6 space-y-4">
                {recipe.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            {user && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Rate this recipe</h2>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant="ghost"
                      size="sm"
                      onClick={() => ratingMutation.mutate(rating)}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          recipe.ratings?.some(
                            (r) => r.userId === user.id && r.rating >= rating
                          )
                            ? "fill-primary"
                            : ""
                        }`}
                      />
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xl font-semibold mb-4">Comments</h2>
              {user && (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((data) =>
                      commentMutation.mutate(data.content)
                    )}
                    className="mb-6"
                  >
                    <Textarea
                      placeholder="Share your thoughts..."
                      {...form.register("content")}
                    />
                    <Button type="submit" className="mt-2">
                      Add Comment
                    </Button>
                  </form>
                </Form>
              )}

              <div className="space-y-4">
                {recipe.comments?.map((comment) => (
                  <Card key={comment.id}>
                    <CardContent className="pt-4">
                      <p className="text-sm">{comment.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="text-sm text-muted-foreground">
          {recipe.sourceName && (
            <span>
              Recipe from:{" "}
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {recipe.sourceName}
              </a>
            </span>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}