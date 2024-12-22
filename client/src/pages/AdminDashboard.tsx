import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Play, Shield, Plus, Loader2, MoreHorizontal } from "lucide-react";
import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Role {
  id: number;
  name: string;
  permissions: string[];
}

interface Selectors {
  recipeLinks: string;
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
}

interface CrawlerConfig {
  id: number;
  siteName: string;
  siteUrl: string;
  enabled: boolean;
  lastCrawl: string | null;
  selectors: Selectors;
}

interface NewCrawlerConfig {
  siteName: string;
  siteUrl: string;
  enabled: boolean;
  selectors: Selectors;
}

export function AdminDashboard() {
  const { toast } = useToast();
  const { hasPermission } = useUser();
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const crawlerForm = useForm<NewCrawlerConfig>({
    defaultValues: {
      siteName: "",
      siteUrl: "",
      enabled: true,
      selectors: {
        recipeLinks: "",
        title: "",
        description: "",
        ingredients: "",
        instructions: "",
      },
    },
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    suggestedConfig: NewCrawlerConfig;
    sampleData: {
      recipeLinks: number;
      sampleTitle?: string;
      sampleDescription?: string;
      sampleIngredients?: string[];
      sampleInstructions?: string[];
    };
  } | null>(null);
  const [editingConfig, setEditingConfig] = useState<CrawlerConfig | null>(null);

  const analyzeWebsiteMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/admin/crawler/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      crawlerForm.reset(data.suggestedConfig);
    },
  });

  const canManageRoles = hasPermission("manage_roles");
  const canManageCrawler = hasPermission("manage_crawler");

  const { data: configs = [], refetch: refetchCrawler } = useQuery<CrawlerConfig[]>({
    queryKey: ["/api/admin/crawler"],
    enabled: canManageCrawler,
  });

  const { data: roles = [], refetch: refetchRoles } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: canManageRoles,
  });

  const createRoleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName,
          permissions: selectedPermissions,
        }),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Role created successfully" });
      setNewRoleName("");
      setSelectedPermissions([]);
      refetchRoles();
    },
  });

  const createCrawlerMutation = useMutation({
    mutationFn: async (data: NewCrawlerConfig) => {
      const response = await fetch("/api/admin/crawler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Crawler configuration added successfully" });
      crawlerForm.reset();
      refetchCrawler();
    },
  });

  const updateCrawlerMutation = useMutation({
    mutationFn: async (data: CrawlerConfig) => {
      const response = await fetch(`/api/admin/crawler/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Crawler configuration updated successfully" });
      setEditingConfig(null);
      crawlerForm.reset();
      refetchCrawler();
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
      refetchCrawler();
    },
  });

  const handleCrawlerSubmit = (data: NewCrawlerConfig) => {
    if (editingConfig) {
      updateCrawlerMutation.mutate({ ...data, id: editingConfig.id, lastCrawl: editingConfig.lastCrawl });
    } else {
      createCrawlerMutation.mutate(data);
    }
  };

  useEffect(() => {
    if (editingConfig) {
      crawlerForm.reset({
        siteName: editingConfig.siteName,
        siteUrl: editingConfig.siteUrl,
        enabled: editingConfig.enabled,
        selectors: editingConfig.selectors,
      });
    } else {
      crawlerForm.reset({
        siteName: "",
        siteUrl: "",
        enabled: true,
        selectors: {
          recipeLinks: "",
          title: "",
          description: "",
          ingredients: "",
          instructions: "",
        },
      });
    }
  }, [editingConfig, crawlerForm]);

  const AVAILABLE_PERMISSIONS = [
    "manage_users",
    "manage_roles",
    "manage_crawler",
    "view_admin_dashboard",
    "moderate_comments",
    "moderate_recipes",
  ];

  const defaultTab = canManageRoles ? "roles" : "crawler";

  if (!canManageRoles && !canManageCrawler) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              You don't have permission to access the admin dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-8">
          {canManageRoles && <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>}
          {canManageCrawler && <TabsTrigger value="crawler">Crawler Configuration</TabsTrigger>}
        </TabsList>

        {canManageRoles && (
          <TabsContent value="roles">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold">Role Management</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Shield className="h-4 w-4 mr-2" />
                    Create Role
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Role</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Role Name</label>
                      <Input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="Enter role name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Permissions</label>
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_PERMISSIONS.map((permission) => (
                          <label
                            key={permission}
                            className="flex items-center space-x-2"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPermissions.includes(permission)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPermissions([...selectedPermissions, permission]);
                                } else {
                                  setSelectedPermissions(
                                    selectedPermissions.filter((p) => p !== permission)
                                  );
                                }
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm">{permission}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => createRoleMutation.mutate()}
                      disabled={!newRoleName || selectedPermissions.length === 0}
                    >
                      Create Role
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Existing Roles</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Permissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {role.permissions.map((permission) => (
                              <span
                                key={permission}
                                className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary"
                              >
                                {permission}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageCrawler && (
          <TabsContent value="crawler">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold">Crawler Management</h2>
              <div className="flex gap-2">
                <Dialog
                  open={!!editingConfig || undefined}
                  onOpenChange={(open) => !open && setEditingConfig(null)}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Website
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingConfig ? "Edit Recipe Website" : "Add New Recipe Website"}
                      </DialogTitle>
                    </DialogHeader>
                    <Form {...crawlerForm}>
                      <form
                        onSubmit={crawlerForm.handleSubmit(handleCrawlerSubmit)}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Site Name</label>
                            <Input
                              {...crawlerForm.register("siteName")}
                              placeholder="e.g. Lodge Cast Iron"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Site URL</label>
                            <div className="flex gap-2">
                              <Input
                                {...crawlerForm.register("siteUrl")}
                                placeholder="https://example.com/recipes"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const url = crawlerForm.getValues("siteUrl");
                                  if (url) {
                                    setIsAnalyzing(true);
                                    analyzeWebsiteMutation.mutate(url, {
                                      onSettled: () => setIsAnalyzing(false),
                                    });
                                  }
                                }}
                                disabled={isAnalyzing}
                              >
                                {isAnalyzing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Analyze"
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {analysisResult && (
                          <div className="rounded-lg border p-4 bg-muted/50">
                            <h3 className="text-sm font-medium mb-2">Analysis Results</h3>
                            <dl className="space-y-2 text-sm">
                              <div>
                                <dt className="font-medium">Recipe Links Found</dt>
                                <dd>{analysisResult.sampleData.recipeLinks}</dd>
                              </div>
                              {analysisResult.sampleData.sampleTitle && (
                                <div>
                                  <dt className="font-medium">Sample Recipe Title</dt>
                                  <dd>{analysisResult.sampleData.sampleTitle}</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        )}

                        <div className="space-y-2">
                          <h3 className="text-sm font-medium">CSS Selectors</h3>
                          <p className="text-sm text-muted-foreground">
                            {analysisResult
                              ? "Selectors were automatically detected. You can modify them if needed."
                              : "Enter CSS selectors to identify recipe elements on the page, or click 'Analyze' to detect them automatically."}
                          </p>

                          <div className="grid gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Recipe Links</label>
                              <Input
                                {...crawlerForm.register("selectors.recipeLinks")}
                                placeholder=".recipe-card a"
                              />
                              <p className="text-xs text-muted-foreground">
                                Selector for links to individual recipe pages
                              </p>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Recipe Title</label>
                              <Input
                                {...crawlerForm.register("selectors.title")}
                                placeholder=".recipe-title"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Description</label>
                              <Input
                                {...crawlerForm.register("selectors.description")}
                                placeholder=".recipe-description"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Ingredients</label>
                              <Input
                                {...crawlerForm.register("selectors.ingredients")}
                                placeholder=".ingredients-list li"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Instructions</label>
                              <Input
                                {...crawlerForm.register("selectors.instructions")}
                                placeholder=".instructions-list li"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            {...crawlerForm.register("enabled")}
                            defaultChecked={true}
                          />
                          <label className="text-sm font-medium">Enable Crawler</label>
                        </div>

                        <Button type="submit" className="w-full">
                          {editingConfig ? "Update Website" : "Add Website"}
                        </Button>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>

                <Button onClick={() => runCrawlerMutation.mutate()}>
                  <Play className="h-4 w-4 mr-2" />
                  Run Crawler
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Crawler Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Last Crawl</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
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
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={config.enabled}
                              onCheckedChange={async (enabled) => {
                                try {
                                  await updateCrawlerMutation.mutateAsync({
                                    ...config,
                                    enabled,
                                  });
                                  toast({
                                    title: `Crawler ${enabled ? "enabled" : "disabled"} successfully`,
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Failed to update crawler status",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            />
                            <span
                              className={`text-sm ${
                                config.enabled
                                  ? "text-green-600"
                                  : "text-gray-500"
                              }`}
                            >
                              {config.enabled ? "Active" : "Disabled"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingConfig(config)}>
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}