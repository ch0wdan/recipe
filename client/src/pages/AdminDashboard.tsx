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
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Play } from "lucide-react";

export function AdminDashboard() {
  const { toast } = useToast();

  const { data: configs = [], refetch } = useQuery({
    queryKey: ["/api/admin/crawler"],
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
      refetch();
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

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Crawler Configurations</h2>
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
                  <TableCell className="font-mono text-sm">
                    {config.siteUrl}
                  </TableCell>
                  <TableCell>
                    {config.lastCrawl
                      ? new Date(config.lastCrawl).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        config.enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {config.enabled ? "Active" : "Disabled"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}