import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SelectedElement {
  selector: string;
  type: 'title' | 'description' | 'ingredients' | 'instructions' | 'prepTime' | 'cookTime' | 'difficulty' | 'servings' | 'image';
  value: string;
}

export function CrawlerAnalyzer() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const [activeSelector, setActiveSelector] = useState<SelectedElement["type"] | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const analyzeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/admin/crawler/analyze-interactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (data) => {
      if (previewRef.current) {
        // Create a new iframe for isolation
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.sandbox.add('allow-same-origin'); // Allow same origin policy

        // Clear existing content and append iframe
        previewRef.current.innerHTML = '';
        previewRef.current.appendChild(iframe);

        // Write the HTML content to the iframe
        const iframeDoc = iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <base href="${data.url}">
                <style>
                  /* Highlight selectable elements */
                  *[data-recipe-element]:hover {
                    outline: 2px solid #3b82f6 !important;
                    cursor: pointer !important;
                  }

                  /* Style for selected elements */
                  *[data-selected="true"] {
                    outline: 2px solid #22c55e !important;
                  }
                </style>
              </head>
              <body>
                ${data.html}
                <script>
                  // Prevent links from navigating
                  document.addEventListener('click', (e) => {
                    if (e.target.tagName === 'A') {
                      e.preventDefault();
                    }
                  });
                </script>
              </body>
            </html>
          `);
          iframeDoc.close();

          // Add click event listener to the iframe document
          iframeDoc.addEventListener('click', (e) => {
            e.preventDefault();
            if (!activeSelector) return;

            // Find the closest element with data-recipe-element
            const target = e.target as HTMLElement;
            if (!target) return;

            let currentElement: HTMLElement | null = target;
            while (currentElement && !currentElement.getAttribute('data-recipe-element')) {
              currentElement = currentElement.parentElement;
            }

            if (!currentElement) return;

            // Get unique data attribute
            const elementId = currentElement.getAttribute('data-recipe-element');
            if (!elementId) return;

            // Remove previous selection for this type
            const previousSelected = iframeDoc.querySelector(`[data-selected="true"][data-selector-type="${activeSelector}"]`);
            if (previousSelected) {
              previousSelected.removeAttribute('data-selected');
              previousSelected.removeAttribute('data-selector-type');
            }

            // Mark as selected
            currentElement.setAttribute('data-selected', 'true');
            currentElement.setAttribute('data-selector-type', activeSelector);

            // Generate a selector for this element
            let selector = '';
            if (currentElement.id) {
              selector = `#${currentElement.id}`;
            } else if (currentElement.className) {
              const classes = Array.from(currentElement.classList)
                .filter(cls => !cls.includes('hover'))
                .join('.');
              selector = classes ? `.${classes}` : '';
            }

            if (!selector) {
              // Fallback to tag name and nth-child if no ID or class
              let index = 1;
              let prev = currentElement.previousElementSibling;
              while (prev) {
                if (prev.tagName === currentElement.tagName) {
                  index++;
                }
                prev = prev.previousElementSibling;
              }
              selector = `${currentElement.tagName.toLowerCase()}:nth-child(${index})`;
            }

            // Get the text content or src for images
            let value = currentElement.tagName.toLowerCase() === 'img' 
              ? currentElement.getAttribute('src') || ''
              : currentElement.textContent?.trim() || '';

            handleElementSelection(selector, value);
          });
        }
      }
      toast({ title: "Page loaded successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to load page", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: { url: string; selectors: Record<string, string> }) => {
      const response = await fetch("/api/admin/crawler/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved successfully" });
      // Reset state
      setSelectedElements([]);
      setUrl("");
      if (previewRef.current) {
        previewRef.current.innerHTML = '';
      }
    },
    onError: (error) => {
      toast({ 
        title: "Failed to save configuration", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleElementSelection = (selector: string, value: string) => {
    if (!activeSelector) return;

    setSelectedElements(prev => {
      // Remove any existing mapping for this type
      const filtered = prev.filter(el => el.type !== activeSelector);
      return [...filtered, { selector, type: activeSelector, value }];
    });
    setActiveSelector(null);
  };

  const handleSaveConfig = () => {
    const selectors = selectedElements.reduce((acc, { type, selector }) => {
      acc[type] = selector;
      return acc;
    }, {} as Record<string, string>);

    saveConfigMutation.mutate({ url, selectors });
  };

  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle>Interactive Crawler Configuration</CardTitle>
          <CardDescription>
            Enter a URL and select elements on the page to configure the crawler
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="Enter website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button
                onClick={() => analyzeUrlMutation.mutate(url)}
                disabled={analyzeUrlMutation.isPending || !url}
              >
                {analyzeUrlMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Load Page
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Select Elements</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'title',
                    'description',
                    'ingredients',
                    'instructions',
                    'prepTime',
                    'cookTime',
                    'difficulty',
                    'servings',
                    'image',
                  ].map((type) => (
                    <Button
                      key={type}
                      variant={activeSelector === type ? "default" : "outline"}
                      onClick={() => setActiveSelector(type as SelectedElement["type"])}
                      className="justify-start"
                    >
                      {type}
                    </Button>
                  ))}
                </div>

                <div className="mt-4">
                  <h4 className="font-medium mb-2">Selected Elements</h4>
                  <div className="space-y-2">
                    {selectedElements.map(({ type, selector, value }) => (
                      <div
                        key={type}
                        className="p-2 border rounded-md text-sm"
                      >
                        <div className="font-medium">{type}</div>
                        <div className="text-muted-foreground">{selector}</div>
                        <div className="text-xs truncate">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="mt-4 w-full"
                  onClick={handleSaveConfig}
                  disabled={selectedElements.length === 0 || saveConfigMutation.isPending}
                >
                  {saveConfigMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Save Configuration
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div 
                  ref={previewRef} 
                  className="w-full h-[600px]"
                ></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}