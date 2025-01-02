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

                  body.selecting * {
                    cursor: crosshair !important;
                  }

                  body.selecting *[data-recipe-element]:hover {
                    outline: 2px dashed #3b82f6 !important;
                    background-color: rgba(59, 130, 246, 0.1) !important;
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
                <script>
                  window.onload = function() {
                    // Add data-recipe-element to all elements
                    document.querySelectorAll('*').forEach((el, index) => {
                      el.setAttribute('data-recipe-element', \`element-\${index}\`);
                    });

                    // Log initialization
                    console.log('Recipe elements initialized');
                  }
                </script>
              </head>
              <body>
                ${data.html}
                <script>
                  // Prevent default actions
                  document.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Send click event to parent
                    if (window.parent) {
                      const target = e.target;
                      window.parent.postMessage({
                        type: 'elementClicked',
                        elementId: target.getAttribute('data-recipe-element'),
                        tagName: target.tagName,
                        className: target.className,
                        id: target.id,
                        textContent: target.textContent,
                        src: target.getAttribute('src'),
                        innerHTML: target.innerHTML
                      }, '*');
                    }
                  }, true);

                  // Handle selection mode
                  window.addEventListener('message', function(event) {
                    if (event.data.type === 'setActiveSelector') {
                      document.body.classList.toggle('selecting', event.data.selector !== null);
                      console.log('Selection mode:', event.data.selector);
                    }
                  });
                </script>
              </body>
            </html>
          `);
          iframeDoc.close();
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

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'elementClicked' && activeSelector) {
        const {
          elementId,
          tagName,
          className,
          id,
          textContent,
          src,
          innerHTML
        } = event.data;

        // Generate selector
        let selector = '';
        if (id) {
          selector = `#${id}`;
        } else if (className) {
          const classes = className.split(' ').filter(Boolean).join('.');
          selector = classes ? `.${classes}` : tagName.toLowerCase();
        } else {
          selector = tagName.toLowerCase();
        }

        // Extract value based on element type and active selector
        let value = '';
        const element = iframeRef.current?.contentWindow?.document.querySelector(`[data-recipe-element="${elementId}"]`);

        if (!element) {
          console.error('Element not found:', elementId);
          return;
        }

        if (tagName.toLowerCase() === 'img' || activeSelector === 'image') {
          value = src || '';
        } else if (activeSelector === 'ingredients' || activeSelector === 'instructions') {
          const listItems = element.querySelectorAll('li');
          if (listItems.length > 0) {
            value = Array.from(listItems)
              .map(item => item.textContent?.trim())
              .filter(Boolean)
              .join('\n');
          } else {
            value = textContent?.trim() || '';
          }
        } else if (activeSelector === 'prepTime' || activeSelector === 'cookTime') {
          const timeText = textContent?.trim() || '';
          const timeMatch = timeText.match(/\d+\s*(?:minute|min|hour|hr|h|m)s?/i);
          value = timeMatch ? timeMatch[0] : timeText;
        } else {
          value = textContent?.trim() || '';
        }

        // Update selected elements
        setSelectedElements(prev => {
          const filtered = prev.filter(el => el.type !== activeSelector);
          return [...filtered, { selector, type: activeSelector, value }];
        });

        // Update visual selection in iframe
        if (element) {
          // Clear previous selection
          const previousSelected = iframeRef.current?.contentWindow?.document.querySelector(
            `[data-selected="true"][data-selector-type="${activeSelector}"]`
          );
          if (previousSelected) {
            previousSelected.removeAttribute('data-selected');
            previousSelected.removeAttribute('data-selector-type');
          }

          // Mark new selection
          element.setAttribute('data-selected', 'true');
          element.setAttribute('data-selector-type', activeSelector);

          // Show success toast
          toast({
            title: `Selected ${activeSelector}`,
            description: `Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`
          });
        }

        // Clear active selector
        setActiveSelector(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeSelector, toast]);

  // Update iframe when activeSelector changes
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'setActiveSelector',
        selector: activeSelector
      }, '*');

      console.log('Active selector updated:', activeSelector);
    }
  }, [activeSelector]);

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
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}