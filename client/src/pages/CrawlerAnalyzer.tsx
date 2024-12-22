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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.sandbox.add('allow-same-origin');
        iframe.sandbox.add('allow-scripts');
        iframeRef.current = iframe;

        previewRef.current.innerHTML = '';
        previewRef.current.appendChild(iframe);

        const iframeDoc = iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <base href="${data.url}">
                <style>
                  * { outline: none !important; }

                  *[data-recipe-element] {
                    transition: all 0.2s ease-in-out;
                  }

                  body.selecting *[data-recipe-element]:hover {
                    outline: 2px dashed #3b82f6 !important;
                    cursor: crosshair !important;
                    position: relative;
                  }

                  *[data-selected="true"] {
                    outline: 2px solid #22c55e !important;
                    background-color: rgba(34, 197, 94, 0.1) !important;
                    position: relative;
                  }

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
                  document.addEventListener('click', (e) => {
                    e.preventDefault();
                  });

                  window.addEventListener('message', (event) => {
                    if (event.data.type === 'setActiveSelector') {
                      document.body.classList.toggle('selecting', event.data.selector !== null);
                    }
                  });
                </script>
              </body>
            </html>
          `);
          iframeDoc.close();

          iframeDoc.addEventListener('click', handleElementClick);
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

  const handleElementClick = (e: MouseEvent) => {
    e.preventDefault();

    if (!activeSelector || !iframeRef.current?.contentWindow?.document) {
      return;
    }

    const target = e.target as HTMLElement;
    if (!target) return;

    const iframeDoc = iframeRef.current.contentWindow.document;

    // Generate selector for the clicked element
    let selector = '';
    if (target.id) {
      selector = `#${target.id}`;
    } else if (target.className) {
      const classes = Array.from(target.classList).join('.');
      selector = classes ? `.${classes}` : target.tagName.toLowerCase();
    } else {
      selector = target.tagName.toLowerCase();
    }

    // Extract value based on the type
    let value = '';
    if (target.tagName.toLowerCase() === 'img') {
      value = target.getAttribute('src') || '';
    } else if (activeSelector === 'ingredients' || activeSelector === 'instructions') {
      const listItems = target.querySelectorAll('li');
      if (listItems.length > 0) {
        value = Array.from(listItems)
          .map(item => item.textContent?.trim())
          .filter(Boolean)
          .join('\n');
      } else {
        value = target.textContent?.trim() || '';
      }
    } else {
      value = target.textContent?.trim() || '';
    }

    // Update selections
    setSelectedElements(prev => {
      const filtered = prev.filter(el => el.type !== activeSelector);
      return [...filtered, { selector, type: activeSelector, value }];
    });

    // Mark element as selected
    const previousSelected = iframeDoc.querySelector(`[data-selected="true"][data-selector-type="${activeSelector}"]`);
    if (previousSelected) {
      previousSelected.removeAttribute('data-selected');
      previousSelected.removeAttribute('data-selector-type');
    }

    target.setAttribute('data-selected', 'true');
    target.setAttribute('data-selector-type', activeSelector);

    // Clear active selector
    setActiveSelector(null);

    // Show success message
    toast({
      title: `Selected ${activeSelector}`,
      description: `Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`,
    });
  };

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
      setSelectedElements([]);
      setUrl("");
      setActiveSelector(null);
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

  const handleSaveConfig = () => {
    const selectors = selectedElements.reduce((acc, { type, selector }) => {
      acc[type] = selector;
      return acc;
    }, {} as Record<string, string>);

    saveConfigMutation.mutate({ url, selectors });
  };

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'setActiveSelector',
        selector: activeSelector
      }, '*');
    }
  }, [activeSelector]);

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
                      className={`justify-start ${
                        selectedElements.some(el => el.type === type) ? "border-green-500" : ""
                      }`}
                    >
                      {type}
                      {selectedElements.some(el => el.type === type) && (
                        <span className="ml-2 text-green-500">✓</span>
                      )}
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