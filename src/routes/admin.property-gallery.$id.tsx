import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Camera, Trash2, Star, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/property-gallery/$id")({
  component: PropertyGalleryDetail,
});

function PropertyGalleryDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [viewerImage, setViewerImage] = useState<any | null>(null);

  const { data: property } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => api.properties.list().then((list: any[]) => list.find((p: any) => p.id === id)),
  });

  const { data: media = [], isLoading } = useQuery({
    queryKey: ["media", id],
    queryFn: () => api.media.list(id),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("Select a file");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
      return api.media.upload({ propertyId: id, image: base64, caption: uploadCaption });
    },
    onSuccess: () => {
      toast.success("Photo uploaded");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadCaption("");
      queryClient.invalidateQueries({ queryKey: ["media", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => api.media.remove(mediaId),
    onSuccess: () => {
      toast.success("Photo deleted");
      queryClient.invalidateQueries({ queryKey: ["media", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (mediaId: string) => api.media.setPrimary(mediaId),
    onSuccess: () => {
      toast.success("Primary photo updated");
      queryClient.invalidateQueries({ queryKey: ["media", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin/property-gallery" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-display font-bold">{property?.name ?? "Property Gallery"}</h1>
          <p className="text-xs text-muted-foreground">{media.length} photo{media.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setUploadOpen(true)}>
          <Plus size={14} /> Add Photo
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground p-4">Loading...</div>
      ) : media.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No photos yet. Upload the first photo.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {media.map((m: any) => (
            <div key={m.id} className="group relative rounded-xl border border-border bg-card overflow-hidden">
              <div className="aspect-[4/3] bg-muted/20 cursor-zoom-in" onClick={() => setViewerImage(m)}>
                <img src={m.url} alt={m.caption || "Property photo"} className="w-full h-full object-cover" />
              </div>
              <div className="p-2">
                <p className="text-[10px] text-muted-foreground truncate">{m.caption || "No caption"}</p>
              </div>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!m.isPrimary && (
                  <button
                    onClick={() => setPrimaryMutation.mutate(m.id)}
                    className="h-7 w-7 rounded-full bg-background/80 flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Set as primary"
                  >
                    <Star size={12} />
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(m.id)}
                  className="h-7 w-7 rounded-full bg-background/80 flex items-center justify-center hover:bg-destructive text-muted-foreground hover:text-destructive-foreground"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {m.isPrimary && (
                <div className="absolute top-2 left-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground font-semibold">
                    Primary
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Photo</DialogTitle>
            <DialogDescription>Add to {property?.name ?? "property"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Photo</label>
              <Input type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Caption</label>
              <Input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="e.g. Main hall" className="h-8 text-xs" />
            </div>
            <Button
              className="w-full text-xs"
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !uploadFile}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox Viewer Dialog */}
      <Dialog open={!!viewerImage} onOpenChange={(o) => { if (!o) setViewerImage(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Photo Details</DialogTitle>
            <DialogDescription>Information about the uploaded property image</DialogDescription>
          </DialogHeader>
          {viewerImage && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="aspect-[4/3] bg-muted/20 rounded-lg overflow-hidden flex items-center justify-center">
                <img src={viewerImage.url} alt={viewerImage.caption || "Full resolution"} className="w-full h-full object-cover" />
              </div>
              <div className="space-y-4 text-xs flex flex-col justify-between">
                <div className="space-y-2">
                  <div>
                    <span className="text-muted-foreground block uppercase text-[9px] tracking-wider font-semibold">Caption</span>
                    <span className="text-sm font-medium">{viewerImage.caption || "No caption provided"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase text-[9px] tracking-wider font-semibold">Type</span>
                    <span className="font-mono">{viewerImage.isPrimary ? "Primary Cover Photo" : "Standard Photo"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase text-[9px] tracking-wider font-semibold">Size</span>
                    <span className="font-mono">{(viewerImage.size ? (viewerImage.size / 1024).toFixed(1) : "0.0")} KB</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase text-[9px] tracking-wider font-semibold">Format</span>
                    <span className="font-mono">{viewerImage.mimeType || "image/jpeg"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase text-[9px] tracking-wider font-semibold">Uploaded At</span>
                    <span>{viewerImage.createdAt ? new Date(viewerImage.createdAt).toLocaleString("en-IN") : "Unknown"}</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  {!viewerImage.isPrimary && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={() => {
                        setPrimaryMutation.mutate(viewerImage.id);
                        setViewerImage(null);
                      }}
                    >
                      <Star size={12} /> Set Primary
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 gap-1"
                    onClick={() => {
                      deleteMutation.mutate(viewerImage.id);
                      setViewerImage(null);
                    }}
                  >
                    <Trash2 size={12} /> Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
