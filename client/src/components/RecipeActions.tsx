import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface RecipeActionsProps {
  recipeId: number;
  recipeName: string;
  onDeleted?: () => void;
}

export function RecipeActions({ recipeId, recipeName, onDeleted }: RecipeActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status >= 500) {
          throw new Error(response.statusText);
        }
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Recipe deleted",
        description: "The recipe has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      setIsDeleteDialogOpen(false);
      onDeleted?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete recipe",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="icon">
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Recipe</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{recipeName}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => setIsDeleteDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
