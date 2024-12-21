import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { useUser } from "@/hooks/use-user";
import { CookingPot, ChefHat, User } from "lucide-react";

export function Navbar() {
  const { user, logout } = useUser();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link href="/">
                <NavigationMenuLink className="flex items-center gap-2 font-bold">
                  <CookingPot className="h-5 w-5" />
                  Cast Iron Recipes
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>Browse</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 w-[400px]">
                  <Link href="/recipes?cookware=skillet">
                    <NavigationMenuLink className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                      <div className="text-sm font-medium leading-none">Skillets</div>
                      <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                        Classic cast iron skillet recipes
                      </p>
                    </NavigationMenuLink>
                  </Link>
                  <Link href="/recipes?cookware=dutch-oven">
                    <NavigationMenuLink className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                      <div className="text-sm font-medium leading-none">Dutch Ovens</div>
                      <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                        Recipes perfect for Dutch oven cooking
                      </p>
                    </NavigationMenuLink>
                  </Link>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex items-center gap-4">
          {user ? (
            <>
              {user.isAdmin && (
                <Link href="/admin">
                  <Button variant="ghost">
                    <ChefHat className="h-5 w-5 mr-2" />
                    Admin
                  </Button>
                </Link>
              )}
              <Button variant="ghost" onClick={() => logout()}>
                <User className="h-5 w-5 mr-2" />
                Logout
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button>
                <User className="h-5 w-5 mr-2" />
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
