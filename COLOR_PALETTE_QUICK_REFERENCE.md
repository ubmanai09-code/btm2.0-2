# Color Palette Quick Reference

## Visual Palette Summary

### LIGHT THEME

#### Backgrounds
```
--bg              #F7F8FA  ██████ Main page background
--bg-secondary    #F0F1F3  ██████ Secondary surface  
--bg-tertiary     #E8EAED  ██████ Tertiary accent
--card            #FFFFFF  ██████ Cards/elevated surfaces
--card-hover      #FAFBFC  ██████ Card hover state
```

#### Text Hierarchy (Primary → Subtle)
```
--text            #1F2937  ██████ Primary text
--text-secondary  #374151  ██████ Secondary/headings
--text-tertiary   #6B7280  ██████ Meta/muted
--text-quaternary #9CA3AF  ██████ Subtle/hints
--text-disabled   #D1D5DB  ██████ Disabled/inactive
```

#### Borders
```
--border          #E6E8EB  ██████ Primary borders
--border-secondary #D1D5DB ██████ Stronger borders
--border-subtle   #F0F1F3  ██████ Very subtle
```

#### Semantic Colors
```
--accent          #F97316  ██████ Orange - Primary action
--success         #16A34A  ██████ Green - Success/positive
--danger          #DC2626  ██████ Red - Errors/destructive
--warning         #F59E0B  ██████ Amber - Warnings/cautions
--info            #0EA5E9  ██████ Sky Blue - Information
--primary         #10B981  ██████ Teal/Emerald - Primary action
```

---

### DARK THEME

#### Backgrounds
```
--bg              #0F172A  ██████ Main page background (navy)
--bg-secondary    #1A2332  ██████ Secondary surface
--bg-tertiary     #2A3444  ██████ Tertiary accent
--card            #1E293B  ██████ Cards/elevated surfaces
--card-hover      #293449  ██████ Card hover state
--card-alt        #334155  ██████ Alternative card
```

#### Text Hierarchy (Primary → Subtle)
```
--text            #F1F5F9  ██████ Primary text (light)
--text-secondary  #E2E8F0  ██████ Secondary/headings
--text-tertiary   #B2BED1  ██████ Meta/muted
--text-quaternary #8C99AD  ██████ Subtle/hints
--text-disabled   #475569  ██████ Disabled/inactive
```

#### Borders
```
--border          #334155  ██████ Primary borders
--border-secondary #475569 ██████ Stronger borders
--border-subtle   #1E293B  ██████ Very subtle
```

#### Semantic Colors
```
--accent          #F97316  ██████ Orange - Primary action
--success         #22C55E  ██████ Bright Green - Success
--danger          #EF4444  ██████ Bright Red - Errors
--warning         #FCD34D  ██████ Bright Amber - Warnings
--info            #38BDF8  ██████ Bright Sky Blue - Info
--primary         #10B981  ██████ Teal/Emerald - Primary
```

---

## Color Harmony

### Light Theme Palette Structure
- **Cool tones:** Blues and grays create a professional, calm appearance
- **Warm accents:** Orange and amber for actions and alerts
- **Greens:** For success and positive actions
- **Reds:** For errors and destructive actions

### Dark Theme Palette Structure
- **Navy/slate base:** Reduces eye strain in low-light environments
- **Lighter text:** High contrast for readability
- **Vibrant accents:** More saturated colors to pop against dark background
- **Consistent semantics:** Same meaning across both themes

---

## Table: Light vs Dark Color Mapping

| Element | Light Theme | Dark Theme | Use Case |
|---------|------------|-----------|----------|
| **Page BG** | #F7F8FA | #0F172A | Entire viewport |
| **Cards** | #FFFFFF | #1E293B | Elevated surfaces |
| **Primary Text** | #1F2937 | #F1F5F9 | Main content |
| **Muted Text** | #6B7280 | #B2BED1 | Meta information |
| **Borders** | #E6E8EB | #334155 | Dividers & edges |
| **Table Header** | #F3F4F6 | #263449 | Table headers |
| **Primary Action** | #F97316 | #F97316 | Buttons, links |
| **Success** | #16A34A | #22C55E | Success states |
| **Error** | #DC2626 | #EF4444 | Error states |

---

## Specific Component Color Usage

### Scoring Table
- **Background:** `--bg-secondary` (was: hardcoded teal)
- **Header:** `--table-header-bg` with `--table-header-text`
- **Text:** `--text` for numbers and scores
- **Benefit:** Minimal, non-distracting styling lets numbers be the focus

### Standings Table
- **Header:** `--table-header-bg` + `--table-header-text`
- **Rows:** `--table-alternate-bg` with `--table-border`
- **Hover:** `--table-row-hover` for interactivity
- **Text:** `--text` for primary, `--text-tertiary` for secondary

### Forms & Inputs
- **Background:** `--card` with slightly muted background
- **Border:** `--border` (light), becomes `--accent` on focus
- **Text:** `--text` for input, `--text-tertiary` for labels
- **Disabled:** `--text-disabled` with reduced opacity

### Buttons
- **Primary:** `--accent` background with `--text-on-accent`
- **Secondary:** `--card` with `--border`
- **Hover:** `--card-hover` or accent lightened
- **Disabled:** `--text-disabled` with `--bg-secondary`

### Menus & Dropdowns
- **Background:** `--card`
- **Border:** `--border`
- **Text:** `--text`
- **Hover:** `--card-hover`
- **Active:** Accent color highlights

### Icons
- **Standard:** `--icon-primary` with opacity
- **Secondary:** `--icon-secondary` (more muted)
- **Disabled:** `--icon-disabled` (very muted)
- **Semantic:** `--accent`, `--success`, `--danger`, etc.

---

## CSS Custom Properties Quick Copy-Paste

### Light Mode Variables
```css
:root {
  /* Backgrounds */
  --bg: #F7F8FA;
  --bg-secondary: #F0F1F3;
  --bg-tertiary: #E8EAED;
  --card: #FFFFFF;
  --card-hover: #FAFBFC;
  --card-alt: #F5F6F8;

  /* Text */
  --text: #1F2937;
  --text-secondary: #374151;
  --text-tertiary: #6B7280;
  --text-quaternary: #9CA3AF;
  --text-disabled: #D1D5DB;

  /* Borders */
  --border: #E6E8EB;
  --border-secondary: #D1D5DB;
  --border-subtle: #F0F1F3;

  /* Semantic */
  --accent: #F97316;
  --success: #16A34A;
  --danger: #DC2626;
  --warning: #F59E0B;
  --info: #0EA5E9;
  --primary: #10B981;
}
```

### Dark Mode Variables
```css
[data-theme="dark"] {
  /* Backgrounds */
  --bg: #0F172A;
  --bg-secondary: #1A2332;
  --bg-tertiary: #2A3444;
  --card: #1E293B;
  --card-hover: #293449;
  --card-alt: #334155;

  /* Text */
  --text: #F1F5F9;
  --text-secondary: #E2E8F0;
  --text-tertiary: #B2BED1;
  --text-quaternary: #8C99AD;
  --text-disabled: #475569;

  /* Borders */
  --border: #334155;
  --border-secondary: #475569;
  --border-subtle: #1E293B;

  /* Semantic */
  --accent: #F97316;
  --success: #22C55E;
  --danger: #EF4444;
  --warning: #FCD34D;
  --info: #38BDF8;
  --primary: #10B981;
}
```

---

## Implementation Checklist

When building new components:

- [ ] All text uses `--text` or semantic variants (`--text-secondary`, `--text-tertiary`, etc.)
- [ ] All backgrounds use `--bg`, `--bg-secondary`, or `--card`
- [ ] All borders use `--border` or border variants
- [ ] All semantic colors match the design intent (success = `--success`, etc.)
- [ ] Tested in both light and dark themes
- [ ] Hardcoded colors have been eliminated
- [ ] Component respects theme switching without page reload
- [ ] Contrast ratios meet WCAG AA standards (4.5:1 for normal text)

---

## Theme Switching

The system uses the `data-theme` attribute to switch themes:

```html
<!-- Light theme (default) -->
<html>

<!-- Dark theme -->
<html data-theme="dark">
```

All CSS variables automatically update when the theme attribute changes. No JavaScript hacks or page reloads needed.

---

## Gradient & Overlay Examples

Using the color palette for gradients and overlays:

```css
/* Gradient from background to card */
.gradient-bg {
  background: linear-gradient(135deg, var(--bg), var(--card));
}

/* Overlay for modal dialogs */
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

/* Button with gradient */
.btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-dark));
  color: var(--text-on-accent);
}
```

---

## Common Mistakes to Avoid

❌ **Don't:** `<span style="color: #6B7280">Muted text</span>`
✅ **Do:** `<span class="text-tertiary">Muted text</span>`

❌ **Don't:** `<div className="bg-[#e3f3f6]">Table</div>`
✅ **Do:** `<div className="surface-accent">Table</div>`

❌ **Don't:** Mix color systems (hardcoded + CSS variables)
✅ **Do:** Use CSS variables consistently throughout

❌ **Don't:** Forget to test dark mode
✅ **Do:** Always verify both themes work correctly

---

## Support

For questions or issues with the color palette:

1. Check [COLOR_PALETTE.md](COLOR_PALETTE.md) for detailed documentation
2. Review [src/index.css](src/index.css) for variable definitions
3. Test theme switching in browser DevTools
4. Verify contrast ratios with accessibility tools

