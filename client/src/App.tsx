import { Switch, Route } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Home } from "@/pages/Home";
import { RecipeDetails } from "@/pages/RecipeDetails";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/AuthPage";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/recipes/:id" component={RecipeDetails} />
          <Route path="/login" component={AuthPage} />
          <Route path="/admin">
            {user?.isAdmin ? <AdminDashboard /> : () => {
              window.location.href = "/";
              return null;
            }}
          </Route>
          <Route>404 - Not Found</Route>
        </Switch>
      </main>
    </div>
  );
}

export default App;