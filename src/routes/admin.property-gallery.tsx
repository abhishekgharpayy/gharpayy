import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, Plus, Image, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/auth-store";

function PropertyGalleryLayout() {
  const { location } = useRouterState();
  const isExact = location.pathname === "/admin/property-gallery";
  if (isExact) return <PropertyGallery />;
  return <Outlet />;
}

export const Route = createFileRoute("/admin/property-gallery")({
  component: PropertyGalleryLayout,
});

function PropertyGallery() {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: () => api.properties.list(),
  });

  const { data: mediaMap } = useQuery({
    queryKey: ["media", "all"],
    queryFn: async () => {
      const map: Record<string, any[]> = {};
      if (!properties) return map;
      for (const p of properties) {
        try {
          const media = await api.media.list(p.id);
          map[p.id] = media;
        } catch { map[p.id] = []; }
      }
      return map;
    },
    enabled: !!properties,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !selectedProperty) throw new Error("Select a file and property");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
      return api.media.upload({
        propertyId: selectedProperty,
        image: base64,
        caption: uploadCaption,
      });
    },
    onSuccess: () => {
      toast.success("Photo uploaded");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadCaption("");
      queryClient.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading properties...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Image size={20} className="text-accent" /> Property Photo Gallery
          </h1>
          <p className="text-xs text-muted-foreground">Upload and manage property photos for WhatsApp sharing</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setUploadOpen(true)}>
          <Plus size={14} /> Upload Photo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties?.map((p: any) => {
          const media = mediaMap?.[p.id] ?? [];
          const primary = media.find((m: any) => m.isPrimary);
          return (
            <Link key={p.id} to="/admin/property-gallery/$id" params={{ id: p.id }} className="block">
              <Card className="hover:border-accent/50 transition-colors cursor-pointer h-full">
                <CardHeader className="p-0">
                  <div className="aspect-video bg-muted/30 rounded-t-xl flex items-center justify-center overflow-hidden">
                    {primary ? (
                      <img src={primary.url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <CardTitle className="text-sm">{p.name}</CardTitle>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {media.length} photo{media.length !== 1 ? "s" : ""}
                    {p.vacantBeds > 0 && ` · ${p.vacantBeds} vacant`}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {(!properties || properties.length === 0) && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No properties yet. Add a property first.
          </div>
        )}
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Property Photo</DialogTitle>
            <DialogDescription>Add photos for WhatsApp property cards</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Property</label>
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="">Select property</option>
                {properties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Photo</label>
              <Input type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Caption (optional)</label>
              <Input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="Living room, view from window..." className="h-8 text-xs" />
            </div>
            <Button
              className="w-full text-xs"
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !uploadFile || !selectedProperty}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
