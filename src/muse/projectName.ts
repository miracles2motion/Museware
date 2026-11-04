import { useProject } from '../store/useProject';

const GENERIC_NAMES = /^(?:untitled\s*project|home|landing|page|screen(?:\s*\d+)?|index|main|app)$/i;

function cleanProjectName(raw: string): string {
  const name = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(?:build|create|make|design)\s+(?:a\s+|an\s+)?(?:landing\s+page\s+for|website\s+for|app\s+for)?\s*/i, '')
    .replace(/(?:\s+(?:landing\s+page|landing|page|screen|website|app))+$/i, '')
    .replace(/[-–—|:]+.*$/, '')
    .trim()
    .slice(0, 40)
    .trim();

  if (!name || GENERIC_NAMES.test(name)) return '';
  return name;
}

export function extractNameFromBlueprint(blueprintText: string): string {
  if (!blueprintText) return '';

  // 1. Check if first screen has a specific descriptive name (e.g. SCREEN: HyperScale AI)
  const screenMatch = blueprintText.match(/^SCREEN:\s*([^\n\r]+)/m);
  if (screenMatch) {
    const candidate = cleanProjectName(screenMatch[1]);
    if (candidate) return candidate;
  }

  // 2. Check for hero or heading title in blueprint
  const heroMatch = blueprintText.match(/^-\s*(?:hero|heading|title)\s*(?:\([^)]*\))?\s*([^\n\r]+)/m);
  if (heroMatch) {
    const candidate = cleanProjectName(heroMatch[1]);
    if (candidate) return candidate;
  }

  // 3. Check RULES: heading
  const rulesMatch = blueprintText.match(/^RULES:\s*([^\n\r]+)/m);
  if (rulesMatch) {
    const candidate = cleanProjectName(rulesMatch[1]);
    if (candidate) return candidate;
  }

  return '';
}

/**
 * Automatically renames the project when a blueprint is approved or building starts,
 * if the user has not explicitly chosen a name.
 */
export function nameProjectFromBlueprint(blueprintText?: string): boolean {
  const { doc, setName, addRail } = useProject.getState();
  if (doc.name !== 'Untitled project' || doc.projectNameLocked) return false;

  let name = extractNameFromBlueprint(blueprintText || doc.blueprint?.text || '');

  // If blueprint had only generic labels, check initial user brief from rail
  if (!name) {
    const firstUserMsg = doc.rail.find((r) => r.role === 'user')?.text || '';
    if (firstUserMsg) {
      name = cleanProjectName(firstUserMsg);
    }
  }

  if (!name) return false;

  setName(name);
  addRail({
    role: 'system',
    text: `Project named "${name}" — rename anytime in the topbar.`,
  });
  return true;
}

/** Called after build completes as a fallback if blueprint didn't assign a name. */
export function nameProjectAfterBuild(): boolean {
  const { doc, setName, addRail } = useProject.getState();
  if (doc.name !== 'Untitled project' || doc.projectNameLocked) return false;
  const entry = doc.screens.find((screen) => screen.entry) || doc.screens[0];
  if (!entry?.root.children.length) return false;

  let name = cleanProjectName(entry.name);

  // If entry screen is named "Home", look for first hero or heading in the children
  if (!name) {
    const heroNode = entry.root.children.find((c) => c.type === 'hero' || c.type === 'heading');
    if (heroNode) {
      const rawTitle = String(heroNode.props.title || heroNode.props.text || '');
      name = cleanProjectName(rawTitle);
    }
  }

  if (!name) return false;
  setName(name);
  addRail({
    role: 'system',
    text: `Project named "${name}" — rename anytime in the topbar.`,
  });
  return true;
}
