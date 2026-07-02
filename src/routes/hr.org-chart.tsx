import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuthUser } from "@/lib/auth-store";
import { Network, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/hr/org-chart")({
  component: OrgChartPage,
});

function OrgChartPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["hr-org-chart"],
    queryFn: () => api.hr.orgChart(),
  });

  const buildTree = () => {
    const map = new Map<string, any>();
    const roots: any[] = [];
    
    // Create map nodes
    users.forEach(u => {
      map.set(u.id, { ...u, children: [] });
    });

    // Assign children to managers
    users.forEach(u => {
      if (u.managerId && map.has(u.managerId)) {
        map.get(u.managerId).children.push(map.get(u.id));
      } else {
        // if they have no manager in the system, they are a root
        roots.push(map.get(u.id));
      }
    });

    return roots;
  };

  const tree = buildTree();

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)]">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">Organizational Chart</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual representation of reporting lines and structure.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-card border border-border rounded-xl p-8 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading org chart...
          </div>
        ) : tree.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No employees found.
          </div>
        ) : (
          <div className="min-w-max flex flex-col items-center">
            {tree.map(node => (
              <OrgNode key={node.id} node={node} isRoot={true} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgNode({ node, isRoot }: { node: any, isRoot?: boolean }) {
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Node Box */}
      <div className={`relative bg-background border border-border rounded-xl shadow-sm p-4 w-64 text-center z-10 transition-transform hover:scale-105 ${isRoot ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}>
        <div className="h-10 w-10 bg-primary/10 text-primary rounded-full mx-auto flex items-center justify-center mb-3">
          <UserIcon className="h-5 w-5" />
        </div>
        <div className="font-semibold truncate" title={node.fullName}>{node.fullName}</div>
        <div className="text-xs text-muted-foreground truncate" title={node.department || 'No Department'}>
          {node.department || 'Department TBD'}
        </div>
        <Badge variant="secondary" className="mt-2 capitalize text-[10px]">
          {node.role}
        </Badge>
      </div>

      {/* Connection Lines & Children */}
      {hasChildren && (
        <>
          {/* Vertical line down from current node */}
          <div className="w-px h-6 bg-border" />
          
          <div className="flex gap-4 relative">
            {/* Horizontal connecting line spanning the children */}
            {node.children.length > 1 && (
              <div className="absolute top-0 h-px bg-border w-[calc(100%-16rem)] left-32 right-32 z-0" />
            )}
            
            {node.children.map((child: any) => (
              <div key={child.id} className="flex flex-col items-center relative z-10">
                {/* Vertical line up to horizontal bus */}
                <div className="w-px h-6 bg-border" />
                <OrgNode node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
