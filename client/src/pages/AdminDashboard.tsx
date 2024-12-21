import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Play } from "lucide-react";

interface CrawlerConfig {
  siteName: string;
  siteUrl: string;
  selectors: {
    title: string;
    description: string;
    ingredients: string;
    instructions: string;
    recipeLinks: string;
  };
}

export function AdminDashboard() {
  const { toast } = useToast();
  const form = useForm<CrawlerConfig>({
    defaultValues: {
      selectors: {
        title: "",
        description: "",
        ingredients: "",
        instructions: "",
        recipeLinks: "",
      },
    },
  });

  const { data: configs = [], refetch } = useQuery({
    queryKey: ["/api/admin/crawler"],
  });

  const configMutation = useMutation({
    mutationFn: async (config: CrawlerConfig) => {
      const response = await fetch("/api/admin/crawler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      form.reset();
      refetch();
      toast({ title: "Crawler configuration added successfully" });
    },
  });

  const runCrawlerMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/crawler/run", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Crawler started successfully" });
    },
  });

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Button onClick={() => runCrawlerMutation.mutate()}>
          <Play className="h-4 w-4 mr-2" />
          Run Crawler
        </Button>
      </div>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Add Crawler Configuration</h2>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => configMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="siteName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="siteUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site URL</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="selectors.title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title Selector</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="selectors.description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description Selector</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="selectors.ingredients"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ingredients Selector</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="selectors.instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions Selector</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="selectors.recipeLinks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipe Links Selector</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button type="submit">Add Configuration</Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Existing Configurations</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Last Crawl</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>{config.siteName}</TableCell>
                    <TableCell>{config.siteUrl}</TableCell>
                    <TableCell>
                      {config.lastCrawl
                        ? new Date(config.lastCrawl).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {config.enabled ? "Enabled" : "Disabled"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
