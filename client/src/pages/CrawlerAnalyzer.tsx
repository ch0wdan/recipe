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
                  /* Reset outline styles */
                  * { outline: none !important; }

                  /* Highlight selectable elements */
                  *[data-recipe-element] {
                    transition: outline 0.2s ease-in-out;
                  }

                  *[data-recipe-element]:hover {
                    outline: 2px dashed #3b82f6 !important;
                    cursor: pointer !important;
                    position: relative;
                  }

                  /* Style for selected elements */
                  *[data-selected="true"] {
                    outline: 2px solid #22c55e !important;
                    position: relative;
                  }

                  /* Label for selected elements */
                  *[data-selected="true"]::before {
                    content: attr(data-selector-type);
                    position: absolute;
                    top: -20px;
                    left: 0;
                    background: #22c55e;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 1000;
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

            // Generate an optimized selector
            let selector = '';

            // Try ID first
            if (currentElement.id) {
              selector = `#${currentElement.id}`;
            } 
            // Then try unique class combinations
            else if (currentElement.className) {
              const classes = Array.from(currentElement.classList)
                .filter(cls => !cls.includes('hover') && !cls.includes('active'))
                .filter(cls => iframeDoc.querySelectorAll(`.${cls}`).length === 1)
                .join('.');
              if (classes) {
                selector = `.${classes}`;
              }
            }

            // If no unique selector found, build one using the element hierarchy
            if (!selector) {
              const path: string[] = [];
              let element: HTMLElement | null = currentElement;
              let foundUniqueSelector = false;

              while (element && element !== iframeDoc.body && !foundUniqueSelector) {
                let elementSelector = element.tagName.toLowerCase();

                // Add classes if they help make the selector more specific
                if (element.className) {
                  const classes = Array.from(element.classList)
                    .filter(cls => !cls.includes('hover') && !cls.includes('active'))
                    .join('.');
                  if (classes) {
                    elementSelector += `.${classes}`;
                  }
                }

                // Add nth-child if needed
                const siblings = element.parentElement?.children;
                if (siblings && siblings.length > 1) {
                  const index = Array.from(siblings).indexOf(element) + 1;
                  elementSelector += `:nth-child(${index})`;
                }

                path.unshift(elementSelector);

                // Check if current path is unique
                const testSelector = path.join(' > ');
                if (iframeDoc.querySelectorAll(testSelector).length === 1) {
                  selector = testSelector;
                  foundUniqueSelector = true;
                }

                element = element.parentElement;
              }

              // If still no unique selector, use the full path
              if (!selector) {
                selector = path.join(' > ');
              }
            }

            // Get the appropriate value based on element type and selector
            let value = '';
            if (currentElement.tagName.toLowerCase() === 'img') {
              value = currentElement.getAttribute('src') || '';
            } else if (activeSelector === 'ingredients' || activeSelector === 'instructions') {
              // For lists, try to get all items
              const listItems = currentElement.querySelectorAll('li');
              if (listItems.length > 0) {
                value = Array.from(listItems)
                  .map(item => item.textContent?.trim())
                  .filter(Boolean)
                  .join('\n');
              } else {
                value = currentElement.textContent?.trim() || '';
              }
            } else if (activeSelector === 'prepTime' || activeSelector === 'cookTime') {
              // Try to extract just the time value
              const timeText = currentElement.textContent?.trim() || '';
              const timeMatch = timeText.match(/\d+\s*(?:minute|min|hour|hr|h|m)s?/i);
              value = timeMatch ? timeMatch[0] : timeText;
            } else {
              value = currentElement.textContent?.trim() || '';
            }

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