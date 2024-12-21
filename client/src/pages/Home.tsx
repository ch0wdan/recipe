import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecipeGrid } from "@/components/RecipeGrid";
import { CookingPot } from "lucide-react";

const COOKWARE_TYPES = [
  { value: "skillet", label: "Skillet" },
  { value: "dutch-oven", label: "Dutch Oven" },
  { value: "griddle", label: "Griddle" },
];

const DIFFICULTY_LEVELS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export function Home() {
  const [cookware, setCookware] = useState<string>();
  const [difficulty, setDifficulty] = useState<string>();

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["/api/recipes", cookware, difficulty],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (cookware) params.append("cookware", cookware);
      if (difficulty) params.append("difficulty", difficulty);
      const response = await fetch(`/api/recipes?${params}`);
      return response.json();
    },
  });

  return (
    <div className="container py-8">
      <div className="flex flex-col items-center text-center mb-12">
        <CookingPot className="h-12 w-12 mb-4 text-primary" />
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Cast Iron Recipes
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Discover delicious recipes crafted specifically for your cast iron cookware.
          From classic skillets to Dutch ovens, find the perfect dish for your kitchen.
        </p>
      </div>

      <div className="flex gap-4 mb-8">
        <Select value={cookware} onValueChange={setCookware}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Cookware Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {COOKWARE_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {DIFFICULTY_LEVELS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <RecipeGrid recipes={recipes} isLoading={isLoading} />
    </div>
  );
}
