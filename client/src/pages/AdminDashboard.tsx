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
import { Play, UserPlus, Shield } from "lucide-react";
import { useState } from "react";

interface Role {
  id: number;
  name: string;
  permissions: string[];
}

interface UserRole {
  id: number;
  userId: number;
  roleId: number;
}

export function AdminDashboard() {
  const { toast } = useToast();
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const { data: configs = [], refetch: refetchCrawler } = useQuery({
    queryKey: ["/api/admin/crawler"],
  });

  const { data: roles = [], refetch: refetchRoles } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
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

  const AVAILABLE_PERMISSIONS = [
    "manage_users",
    "manage_roles",
    "manage_crawler",
    "view_admin_dashboard",
    "moderate_comments",
    "moderate_recipes",
  ];

  return (
    <div className="container py-8">
      <Tabs defaultValue="roles">
        <TabsList className="mb-8">
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="crawler">Crawler Configuration</TabsTrigger>
        </TabsList>

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

        <TabsContent value="crawler">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold">Crawler Management</h2>
            <Button onClick={() => runCrawlerMutation.mutate()}>
              <Play className="h-4 w-4 mr-2" />
              Run Crawler
            </Button>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}