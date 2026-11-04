# PRODUCT BRIEF
**Museware: The canvas that builds with you**
*Describe it. Approve the plan. Watch it build. Then change anything.* | November 2026 | Version 1.0

## Document Information
| Attribute | Details |
|---|---|
| Product Name | Museware |
| Team | Osasumwen Ngozi Scott (ONSInsights): Co-founder and Product Lead<br><br>Miracle Aigbomian (miracles2motion): Co-founder and Developer |
| Primary Stakeholders | Meta Global AI Developer Hackathon judges |
| Event / Track | Meta Global AI Developer Hackathon (Cerebral Valley), Indie track |
| Submission Date | November 4, 2026 |
| Project Duration | Hackathon window of Oct 26 to Nov 4, 2026. First commit Oct 29 |
| Stage | Hackathon prototype build |
| Live App | https://museware.vercel.app |
| Repository | https://github.com/miracles2motion/museware |
| Last Updated | November 2026 |

## 1. SUMMARY
Museware is a visual AI-powered building environment that helps founders and makers turn ideas into editable prototypes, with greater control over how their creations look and behave. You describe an interface, approve the plan, and watch Muse, the AI assistant, build it as real elements. You and Muse then work on one shared component tree with one shared undo. Drag and restyle anything by hand, ask Muse for a scoped change, check the result at three screen sizes, and export a website or React project. Museware was built from scratch during the hackathon, with no code copied from other projects, and runs on Meta's Muse model family.

## 2. PROBLEM
**Who**
Founders and makers who want to turn an idea into something they can show and refine without depending entirely on developers. Designers, product managers and developers are secondary audiences.

**What**
You're building with an AI, you change one tiny detail, and suddenly the whole thing has changed. Now you're back and forth explaining what you actually meant. We've lived this ourselves, and the data points the same way: in Sonar's 2026 State of Code Developer Survey, 96% of developers said they don't fully trust AI-generated code is functionally correct, and only 48% said they always check it before committing.

The same pattern shows up in everyday building:
- Every fix is another prompt, and each prompt can change parts you had already approved.
- The person can't reach in and fix one thing directly while the AI keeps up.
- Plans are often implicit, so people find out what the AI decided only after it builds.
- Checking several screen sizes and getting clean files out are separate chores.

In prompt-only AI builders, every fix is another prompt. In Museware you edit directly, and your edits stay when Muse changes something else.

**Core promise**
Greater control over refining and customizing what AI creates.

**Why now**
- Agent edits can be made safe to share with a person. Muse works through constrained, validated edit tools, and a rejected batch never partially lands.
- The Muse model family is available to developers through Meta's Model API, covering text, vision and images.
- Prompting to build is already familiar, so refining after generation is the next friction point.

## 3. TARGET USER AND PERSONAS
**Segments**
- **Primary:** founders and makers building MVPs and early prototypes. Persona: Chidi.
- **Secondary:** designers and product managers turning requirements into interfaces. Persona: Amara.
- **Secondary:** developers who want an editable starting point they can export. Persona: Daniel.

**Primary persona: "Chidi, the Solo Founder"**
| | |
|---|---|
| Name | Chidi Okafor, 29 |
| Role | Solo founder of an early-stage marketplace idea, Abuja |
| Tools today | An AI app builder, a notes app, and a chat thread with a freelance developer |
| Pain today | The AI builder gets his screens about 80% right. Every fix is another prompt, and each one risks changing parts he'd already approved. |
| Job-to-be-done | "When an AI builder gets my screens almost right, help me fix the last bit myself, so I can show users and investors a real prototype without waiting on a developer." |
| Success looks like | An approved plan, a built set of screens he can click through, one hand edit and one AI change that respect each other, and an export he can host or hand to a developer |

**Secondary persona: "Amara, the Product Manager"**
| | |
|---|---|
| Name | Amara Eze, 31 |
| Role | Product Manager at a fintech company, Lagos |
| Tools today | A design tool, docs and spreadsheets, and occasional AI mockups |
| Pain today | She can describe a feature clearly, but turning it into something clickable means waiting on design or engineering, or re-prompting an AI until it drifts. |
| Job-to-be-done | "When I need to show my team what I mean, help me turn my requirements into a screen I can adjust myself." |
| Success looks like | A blueprint she can read and approve, screens she can check at phone, tablet and desktop sizes, and a result she can share for feedback |

**Secondary persona: "Daniel, the Developer"**
| | |
|---|---|
| Name | Daniel Mensah, 26 |
| Role | Freelance front-end developer, Accra |
| Tools today | A code editor, component libraries, and an AI coding assistant |
| Pain today | Clients want a prototype fast, and he spends the first day on boilerplate and layout. |
| Job-to-be-done | "When a client wants a prototype quickly, give me an editable starting point I can export as real code and keep building." |
| Success looks like | A React project export that opens and runs, with a design he can adjust visually before taking over in code |

## 4. SOLUTION
A web workspace built around four loops.

**Plan.** An empty project offers three ways in: add a blank screen, start from a prompt, or start from a screenshot. From a prompt, Muse offers two to four design directions with color swatches, then a text blueprint of screens, component hierarchy, styling rules and navigation. You can expand it, adjust it (up to three rounds) or cancel. Nothing is built until you approve.

**Build.** Muse builds editable elements in ordered, validated batches of at most 12 operations, filling every list, table and chart with realistic sample rows. You see live progress and a Stop button. A rejected batch never partially lands.

**Refine.** Drag, restyle or edit properties by hand, or ask Muse for a scoped change with "Redesign this section" or "Edit this widget." When a project already has screens, Muse edits the active screen and selected element in place, and doesn't add unwanted screens. Every change, from you or from Muse, goes through one pipeline into one shared history with up to 50 undo steps.

**Run and export.** Run mode previews real interactions (tabs, forms, navigation, state toggles) at three sizes: compact (390), medium (600 and up) and expanded (1024 and up). Export a single HTML file, a static site ZIP, or a React project ZIP (Vite, React and TypeScript). Four starter templates (landing page, habit tracker, analytics dashboard, storefront) also run in an offline demo mode.

*Illustration: a coffee-roaster landing page. Describe it, pick a palette, approve the blueprint, edit the heading by hand, ask Muse to tighten one section, undo a step, check three sizes, export.*

**Design principles**
- **One shared tree:** you and Muse change the same component tree, so neither overwrites the other.
- **Plan before pixels:** you approve before anything is built.
- **You stay in control:** Stop, adjust and undo are always available.
- **Honest by default:** keys, errors, saving and failed images are reported plainly, and a project isn't called saved until a write succeeds.
- **Token-enforced styling:** colors and spacing come from design tokens, and build checks fail on hardcoded values.

## 5. MVP SCOPE
| In scope (this release) | Out of scope (this release) |
|---|---|
| Blank, prompt and screenshot entry points | Cloud sync, accounts and team editing |
| Muse chat with direction choice, blueprint approval and building | Real backends: database, payments, authentication |
| Canvas, layers, inspector, 40 component types | Native mobile apps |
| Drag-and-drop and manual building without AI | Built-in one-click hosting |
| Responsive overrides at three breakpoints | Pixel-exact screenshot recreation |
| Scoped AI edits and existing-project awareness | Multi-image attachments |
| Shared 50-step undo across person and Muse | Visual pre-build preview with alternatives |
| No-code actions and editable sample data | Voice input |
| Run mode at three sizes | Security audit |
| Image generation within a project budget | |
| Local saving, backup and import | |
| Export: HTML, static site ZIP, React ZIP | |
| Four starter templates and offline demo mode | |

## 6. SUCCESS METRICS (PROPOSED)
**North Star**
Successful user-directed build milestones per active user. A milestone is a meaningful change the user makes or approves that persists in the project.

**Counted events**
Each change is applied with its source (person or Muse), so all three can be counted.
- A blueprint is approved and successfully built.
- A manual edit survives a later Muse change.
- A project export succeeds.

**Supporting metrics**
- **Efficiency:** user messages needed to reach an accepted screen.
- **Speed:** time to an accepted screen.
- **Output quality:** share of Muse changes followed by a manual correction.

**Quality gates**
All automated tests pass and the TypeScript build compiles without errors.

**Guardrails**
- No claim appears in any document or screen without evidence.
- No work is described as saved before the write succeeds.
- Export never changes the saved project.
- A rejected edit batch never partially applies.

## 7. ASSUMPTIONS AND RISKS
**Key assumptions**
| Assumption | How we validate |
|---|---|
| A shared canvas reduces re-prompting | Timed task: prompt-only baseline vs Museware |
| People understand the approval step | Moderated sessions with first-time users |
| A hand edit survives a later AI change | Count it from the change history, then test with users |
| The three-size preview is useful | Observe whether testers use it |
| Exported files work as expected | Open and run each export format |

**Top risks and mitigations**
- **House key limits during judging:** a daily spend cap protects the key. If it runs out, the app shows a key card where users can enter their own Meta API key, or they can use the offline demo mode.
- **Screenshot fidelity:** the builder receives the approved text blueprint, not the original image, and vision latency varies. Position screenshot import as a starting point.
- **Browser-only storage can be cleared:** prompt for backups and show a persistent save-failure warning.
- **AI output varies:** keep Stop, undo and manual editing central.
- **Competitive pressure from AI app builders:** win on the shared tree and the approval step, not feature breadth.
- **Claims outrun evidence:** every claim maps to the code, tests or the live product.

## 8. ROADMAP SIGNAL (DIRECTION, NOT SHIPPED)
- **Now:** problem validation. Put Museware in front of founders and makers to confirm the problem and find where people get stuck.
- **Next:**
  - Improve how well Museware recreates a design from a reference screenshot.
  - Add a visual preview of a few alternatives before building.
  - Open the starter templates to community contributions.
  - Let people save and share reusable components.
  - Voice input, powered by Meta's voice model, so you can describe what you want or talk through ideas with Muse.
- **Later:**
  - Shared team workspaces.
  - A database, so prototypes can store and show real data.

## 9. OPEN QUESTIONS AND DECISIONS
**Resolved decisions**
- **Lead audience:** founders and makers, with designers, PMs and developers secondary.
- **Track:** Indie.
- **Output:** web-based, not native.
- **Storage:** projects save in the browser for this release.
- **Planning:** Muse Spark writes the blueprint by default. Wonder is an opt-in architect mode.
- **Originality:** built from scratch during the hackathon, with no code copied.

**Current open questions**
- Is the primary promise a website builder, an app prototyper, or both?
- What is the commercial model?
- What launch quality bar and support capacity do we want?

## 10. ECOSYSTEM ALIGNMENT
| Partner | Role in Museware | Status |
|---|---|---|
| Meta Muse Spark 1.3 | Builder and chat: writes canvas edits, writes the blueprint by default, reads screenshots | Live |
| Meta Wonder 1.0 | Opt-in architect mode for deeper structure and multi-screen blueprints | Live, off by default |
| Meta Muse-image-1.0 | Generates images that match the design brief and color tokens | Live when configured |
| Meta Model API | Reached through a server proxy that keeps the house key private; users can bring their own key | Live |
| Vercel | Hosts the live app | Live |
