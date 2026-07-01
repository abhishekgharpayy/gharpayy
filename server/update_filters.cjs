const fs = require('fs');
const path = require('path');

const DIR = "c:\\Users\\shrib\\Downloads\\gharpayy_main\\Gharpayy-Ops\\src";

function findFiles(dir, files = []) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findFiles(fullPath, files);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = findFiles(DIR);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace text-[10px] px-2 py-0.5 rounded-full border transition-colors with new styles
  if (content.includes("text-[10px] px-2 py-0.5 rounded-full border transition-colors")) {
    content = content.replaceAll(
      "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
      "text-[11px] font-medium rounded-full px-3 py-1 transition-colors"
    );
    changed = true;
  }

  // Replace bg-accent text-accent-foreground border-accent
  if (content.includes("bg-accent text-accent-foreground border-accent")) {
    content = content.replaceAll(
      "bg-accent text-accent-foreground border-accent",
      "bg-primary text-primary-foreground shadow-sm"
    );
    changed = true;
  }

  // Replace bg-accent text-accent-foreground
  if (content.includes("bg-accent text-accent-foreground")) {
    content = content.replaceAll(
      "bg-accent text-accent-foreground",
      "bg-primary text-primary-foreground shadow-sm"
    );
    changed = true;
  }

  // Replace border-border text-muted-foreground hover:border-foreground/30
  if (content.includes("border-border text-muted-foreground hover:border-foreground/30")) {
    content = content.replaceAll(
      "border-border text-muted-foreground hover:border-foreground/30",
      "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"
    );
    changed = true;
  }

  // Replace bg-muted/40 text-muted-foreground border-border hover:bg-muted
  if (content.includes("bg-muted/40 text-muted-foreground border-border hover:bg-muted")) {
    content = content.replaceAll(
      "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
      "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"
    );
    changed = true;
  }
  
  if (content.includes("text-[10px] px-2.5 py-1 rounded-full border transition-colors")) {
    content = content.replaceAll(
      "text-[10px] px-2.5 py-1 rounded-full border transition-colors",
      "text-[11px] font-medium rounded-full px-3 py-1 transition-colors"
    );
    changed = true;
  }
  
  if (content.includes("text-[11px] px-2 py-1 rounded-full border transition-colors")) {
    content = content.replaceAll(
      "text-[11px] px-2 py-1 rounded-full border transition-colors",
      "text-[11px] font-medium rounded-full px-3 py-1 transition-colors"
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log("Updated", file);
  }
}
