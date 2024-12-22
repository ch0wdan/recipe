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
import { Loader2, X } from "lucide-react";

interface ElementSelection {
  selector: string;
  type: 'title' | 'description' | 'ingredients' | 'instructions' | 'prepTime' | 'cookTime' | 'difficulty' | 'servings' | 'image';
  value: string;
}

interface ElementClickMessage {
  type: 'elementClicked';
  element: {
    tagName: string;
    id: string;
    className: string;
    textContent: string;
    innerHTML: string;
    src: string | null;
    dataset: DOMStringMap;
    path: string;
  };
}

interface SelectorMessage {
  type: 'setActiveSelector' | 'clearSelection';
  selector: string | null;
}

export function CrawlerAnalyzer() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [selectedElements, setSelectedElements] = useState<ElementSelection[]>([]);
  const [activeSelector, setActiveSelector] = useState<ElementSelection["type"] | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const initializeIframe = (iframeDoc: Document, data: { html: string; url: string }) => {
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
              e.stopPropagation();

              const generateSelector = (element) => {
                if (!element) return '';

                if (element.id) {
                  return '#' + element.id;
                }

                let selector = element.tagName.toLowerCase();
                const classList = Array.from(element.classList || [])
                  .filter(cls => !cls.includes('hover') && !cls.includes('active'));

                if (classList.length > 0) {
                  selector += '.' + classList.join('.');
                }

                const parent = element.parentElement;
                if (parent) {
                  const siblings = Array.from(parent.children)
                    .filter(child => child.tagName === element.tagName);

                  if (siblings.length > 1) {
                    const index = siblings.indexOf(element) + 1;
                    selector += ':nth-child(' + index + ')';
                  }
                }

                return selector;
              };

              if (window.parent) {
                window.parent.postMessage({
                  type: 'elementClicked',
                  element: {
                    tagName: e.target.tagName,
                    id: e.target.id,
                    className: e.target.className,
                    textContent: e.target.textContent,
                    innerHTML: e.target.innerHTML,
                    src: e.target.tagName === 'IMG' ? e.target.src : null,
                    dataset: e.target.dataset,
                    path: generateSelector(e.target)
                  }
                }, '*');
              }
            });

            window.addEventListener('message', (event) => {
              const data = event.data;
              if (data.type === 'setActiveSelector') {
                document.body.classList.toggle('selecting', Boolean(data.selector));
              } else if (data.type === 'clearSelection' && data.selector) {
                const element = document.querySelector(data.selector);
                if (element) {
                  element.removeAttribute('data-selected');
                  element.removeAttribute('data-selector-type');
                }
              }
            });
          </script>
        </body>
      </html>
    `);
    iframeDoc.close();
  };

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

        if (iframe.contentWindow?.document) {
          initializeIframe(iframe.contentWindow.document, data);
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

  const handleElementClick = (event: MessageEvent<ElementClickMessage>) => {
    if (event.data.type !== 'elementClicked' || !activeSelector) return;

    const { element } = event.data;

    // Extract value based on the selector type
    let value = '';
    if (element.tagName.toLowerCase() === 'img') {
      value = element.src || '';
    } else if (activeSelector === 'ingredients' || activeSelector === 'instructions') {
      const listItems = element.innerHTML.match(/<li[^>]*>(.*?)<\/li>/g);
      if (listItems) {
        value = listItems
          .map(item => item.replace(/<[^>]*>/g, '').trim())
          .filter(Boolean)
          .join('\n');
      } else {
        value = element.textContent?.trim() || '';
      }
    } else {
      value = element.textContent?.trim() || '';
    }

    // Add new selection
    const selection = {
      selector: element.path,
      type: activeSelector,
      value
    };

    setSelectedElements(prev => [...prev, selection]);

    // Mark element as selected in iframe
    if (iframeRef.current?.contentWindow?.document) {
      const targetElement = iframeRef.current.contentWindow.document.querySelector(element.path);
      if (targetElement) {
        targetElement.setAttribute('data-selected', 'true');
        targetElement.setAttribute('data-selector-type', activeSelector);
      }
    }

    // Show success message
    toast({
      title: `Added ${activeSelector} selector`,
      description: `Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`,
    });
  };

  const removeSelection = (index: number) => {
    const selection = selectedElements[index];

    // Remove selection highlight from iframe
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'clearSelection',
        selector: selection.selector
      } as SelectorMessage, '*');
    }

    // Remove from state
    setSelectedElements(prev => prev.filter((_, i) => i !== index));
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
      if (acc[type]) {
        acc[type] = `${acc[type]}, ${selector}`;
      } else {
        acc[type] = selector;
      }
      return acc;
    }, {} as Record<string, string>);

    saveConfigMutation.mutate({ url, selectors });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ElementClickMessage>) => handleElementClick(event);
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeSelector]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'setActiveSelector',
        selector: activeSelector
      } as SelectorMessage, '*');
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
                      onClick={() => setActiveSelector(type as ElementSelection["type"])}
                      className={`justify-start ${
                        selectedElements.some(el => el.type === type) ? "border-green-500" : ""
                      }`}
                    >
                      {type}
                      {selectedElements.filter(el => el.type === type).length > 0 && (
                        <span className="ml-2 text-green-500">{
                          selectedElements.filter(el => el.type === type).length
                        }</span>
                      )}
                    </Button>
                  ))}
                </div>

                <div className="mt-4">
                  <h4 className="font-medium mb-2">Selected Elements</h4>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedElements.map((element, index) => (
                      <div
                        key={`${element.type}-${index}`}
                        className="p-2 border rounded-md text-sm relative group"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeSelection(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <div className="font-medium">{element.type}</div>
                        <div className="text-muted-foreground break-all pr-8">{element.selector}</div>
                        <div className="text-xs truncate mt-1">{element.value}</div>
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