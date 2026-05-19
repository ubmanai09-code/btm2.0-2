# Global Color Palette System

## Overview

This document outlines the comprehensive color palette system for the Bowling Tournament Manager application. The system is designed to ensure consistency across light and dark modes while maintaining excellent readability and accessibility.

All colors are defined as CSS custom properties (variables) in [src/index.css](src/index.css) and should be used throughout the application instead of hardcoded hex values.

---

## CSS Custom Properties Structure

### Light Mode (Default)
Base variables defined in `:root` selector

### Dark Mode
Theme-specific overrides in `[data-theme="dark"]` selector

---

## Color Categories

### 1. Background Colors

#### Primary Backgrounds
- `--bg`: Main page/viewport background
  - Light: `#F7F8FA` (very light blue-gray)
  - Dark: `#0F172A` (navy)

- `--bg-secondary`: Secondary surface background
  - Light: `#F0F1F3` (light gray-blue)
  - Dark: `#1A2332` (dark blue-gray)

- `--bg-tertiary`: Tertiary/accent background
  - Light: `#E8EAED` (gray-blue)
  - Dark: `#2A3444` (medium dark blue-gray)

#### Card & Surface
- `--card`: Primary card/surface color (elevated)
  - Light: `#FFFFFF` (white)
  - Dark: `#1E293B` (charcoal)

- `--card-hover`: Card hover state
  - Light: `#FAFBFC` (nearly white)
  - Dark: `#293449` (slightly lighter charcoal)

- `--card-alt`: Alternative card background
  - Light: `#F5F6F8` (light gray-blue)
  - Dark: `#334155` (medium gray-blue)

### 2. Text Colors (Semantic Hierarchy)

All text colors follow a 4-level hierarchy for consistent visual hierarchy:

#### Primary Text
- `--text`: Main body text, primary headings
  - Light: `#1F2937` (dark gray)
  - Dark: `#F1F5F9` (light blue-gray)
  - **Use for:** Main content, primary headings, important text

#### Secondary Text
- `--text-secondary`: Secondary headings, labels
  - Light: `#374151` (medium-dark gray)
  - Dark: `#E2E8F0` (white-ish)
  - **Use for:** Subheadings, labels, form headers

#### Tertiary Text (Muted)
- `--text-tertiary`: Meta information, timestamps, hints
  - Light: `#6B7280` (medium gray)
  - Dark: `#B2BED1` (medium light blue-gray)
  - **Alias:** `--text-muted` (for backward compatibility)
  - **Use for:** Descriptions, secondary info, timestamps

#### Quaternary Text (Subtle)
- `--text-quaternary`: Very subtle, de-emphasized text
  - Light: `#9CA3AF` (light-medium gray)
  - Dark: `#8C99AD` (muted blue-gray)
  - **Alias:** `--text-subtle` (for backward compatibility)
  - **Use for:** Very subtle details, nearly invisible text

#### Disabled Text
- `--text-disabled`: Fully disabled/inactive elements
  - Light: `#D1D5DB` (light gray)
  - Dark: `#475569` (dark gray-blue)
  - **Use for:** Disabled form fields, inactive buttons

#### Text on Colored Backgrounds
- `--text-on-accent`, `--text-on-primary`, `--text-on-success`, `--text-on-danger`
  - Always `#FFFFFF` (white) in both themes
  - **Use for:** Text overlaid on colored backgrounds

### 3. Border Colors

- `--border`: Primary borders, dividers
  - Light: `#E6E8EB` (very light gray)
  - Dark: `#334155` (medium dark blue-gray)
  - **Use for:** Table borders, form input borders, general dividers

- `--border-secondary`: Stronger borders for emphasis
  - Light: `#D1D5DB` (light gray)
  - Dark: `#475569` (darker gray-blue)
  - **Use for:** Active states, stronger divisions

- `--border-subtle`: Very subtle borders
  - Light: `#F0F1F3` (almost invisible)
  - Dark: `#1E293B` (nearly invisible against dark bg)
  - **Use for:** Very subtle visual separation

### 4. Icon Colors

- `--icon-primary`: Standard icon color
  - Light: `#6B7280` (medium gray)
  - Dark: `#B2BED1` (light gray-blue)
  - Opacity: 0.6 (light), 0.7 (dark)

- `--icon-secondary`: Muted icon color
  - Light: `#9CA3AF` (light gray)
  - Dark: `#8C99AD` (medium gray-blue)

- `--icon-disabled`: Disabled icon color
  - Light: `#D1D5DB` (light gray, low opacity)
  - Dark: `#475569` (dark gray-blue, low opacity)

### 5. Semantic Status Colors

#### Accent (Primary Action)
- `--accent`: Primary action color (orange)
  - Base: `#F97316`
  - Light: `#FED7AA`
  - Lighter: `#FFEDD5`
  - Dark: `#EA580C`
  - Surface: `#FFFBEB`

#### Success (Positive)
- `--success`: Success/confirmation
  - Light theme: `#16A34A` (green)
  - Dark theme: `#22C55E` (bright green)
  - Additional: Light, Lighter, Dark variants, Surface

#### Danger (Error)
- `--danger`: Errors, destructive actions
  - Light: `#DC2626` (red)
  - Dark: `#EF4444` (bright red)
  - Additional: Light, Lighter, Dark variants, Surface

#### Warning (Alert)
- `--warning`: Warnings, cautions
  - Light: `#F59E0B` (amber)
  - Dark: `#FCD34D` (bright amber)
  - Additional: Light, Lighter, Dark variants, Surface

#### Info (Information)
- `--info`: Information, neutral messages
  - Light: `#0EA5E9` (sky blue)
  - Dark: `#38BDF8` (bright sky blue)
  - Additional: Light, Lighter, Dark variants, Surface

#### Primary (Action)
- `--primary`: Primary action color (teal/emerald)
  - Base: `#10B981`
  - Light: `#6EE7B7`
  - Lighter: `#D1FAE5`
  - Dark: `#059669`
  - Surface: `#F0FDF4`

### 6. Table Colors

- `--table-header-bg`: Table header background
  - Light: `#F3F4F6` (light gray)
  - Dark: `#263449` (dark blue-gray)

- `--table-header-text`: Table header text
  - Light: `#374151` (dark gray)
  - Dark: `#E2E8F0` (light text)

- `--table-row-hover`: Row hover state
  - Light: `#F9FAFB` (very light gray)
  - Dark: `#1F2937` (slightly lighter than card)

- `--table-border`: Table borders
  - Light: `#E5E7EB` (light gray)
  - Dark: `#475569` (medium gray-blue)

- `--table-alternate-bg`: Alternate row background
  - Light: `#FFFFFF` (white)
  - Dark: `#1E293B` (card color)

### 7. Surface Colors (Subtle Accents)

Subtle background surfaces for different semantic meanings:

- `--accent-surface`: Accent background
- `--success-surface`: Success background
- `--danger-surface`: Danger background
- `--warning-surface`: Warning background
- `--info-surface`: Info background
- `--primary-surface`: Primary background

These are intentionally muted so they don't distract from content.

---

## Usage Guidelines

### For Text

```html
<!-- Primary content text -->
<p class="text-primary">Main content</p>

<!-- Secondary/subheading text -->
<h2 class="text-secondary">Section heading</h2>

<!-- Descriptive/meta text -->
<span class="text-tertiary">Timestamp: 2 hours ago</span>

<!-- Subtle/hint text -->
<p class="text-quaternary">Optional parameter</p>

<!-- Disabled text -->
<span class="text-disabled">Not available</span>
```

### For Icons

```html
<!-- Standard icon -->
<Icon className="icon-primary" />

<!-- Muted icon -->
<Icon className="icon-secondary" />

<!-- Disabled icon -->
<Icon className="icon-disabled" />

<!-- Colored icons -->
<Icon className="icon-accent" />
<Icon className="icon-success" />
<Icon className="icon-danger" />
```

### For Backgrounds

```html
<!-- Accent surface -->
<div class="surface-accent">Content</div>

<!-- Success surface -->
<div class="surface-success">Success message</div>

<!-- Danger surface -->
<div class="surface-danger">Error message</div>
```

### For Badges

```html
<!-- Primary badge -->
<span class="badge-primary">Primary</span>

<!-- Success badge -->
<span class="badge-success">Success</span>

<!-- Danger badge -->
<span class="badge-danger">Danger</span>
```

### For Tables

Tables automatically use the color palette through CSS. No additional classes needed for standard tables, as they inherit from `<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>` styling.

### Direct CSS Variable Usage

When creating custom styles, always use CSS variables:

```css
.my-component {
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border);
}

.my-component:hover {
  background: var(--card-hover);
}

.my-component.accent {
  background: var(--accent-surface);
  color: var(--accent);
}
```

---

## Specific Component Applications

### Scoring Table
The scoring table now uses **subtle, minimal coloring** (`--bg-secondary`) instead of the previous overly saturated teal background. This allows users to focus on the numbers and scores.

**Before:** `#e3f3f6` (bright teal - light theme)
**Now:** `var(--bg-secondary)` (subtle gray-blue - respects theme)

### Standings Table
Uses standard table styling with proper header contrast and hover states for easy reading.

### Forms & Inputs
- Background: `var(--card)` with `var(--border)` border
- Placeholder: `var(--text-tertiary)`
- Focus: Border color changes to `var(--accent)`
- Disabled: Uses `--text-disabled` color

### Buttons & Menus
- Normal state: Card color background with text color
- Hover state: Slightly lighter background
- Active state: Accent color emphasis
- Disabled state: Muted colors with reduced opacity

### Cards & Panels
- Background: `var(--card)`
- Border: `var(--border)`
- Text: `var(--text)` for primary, `var(--text-tertiary)` for meta

---

## Migration Guide

### For Existing Hardcoded Colors

Replace hardcoded hex values with CSS variables:

**Before:**
```jsx
<div className="bg-[#e3f3f6]">Content</div>
<span className="text-[#6B7280]">Meta text</span>
```

**After:**
```jsx
<div className="surface-accent">Content</div>
<span className="text-tertiary">Meta text</span>
```

### Color Mapping Reference

| Old Color | New Variable | Use Case |
|-----------|-------------|----------|
| `#1F2937` | `--text` | Primary text |
| `#6B7280` | `--text-tertiary` | Meta/muted text |
| `#9CA3AF` | `--text-quaternary` | Subtle text |
| `#F7F8FA` | `--bg` | Page background |
| `#FFFFFF` | `--card` | Card background |
| `#E6E8EB` | `--border` | Borders |
| `#e3f3f6` | `--bg-secondary` | Table/subtle surfaces |
| `#F97316` | `--accent` | Primary action |
| `#16A34A` | `--success` | Success states |
| `#DC2626` | `--danger` | Error states |

---

## Accessibility Considerations

The color palette adheres to WCAG AA contrast standards:

- **Text:** All text colors maintain a 4.5:1 contrast ratio against their backgrounds
- **Icons:** Icon colors are adjusted for visibility in both themes
- **Tables:** Headers have strong contrast for clarity
- **Disabled states:** Clearly differentiated from active states

---

## Dark Mode Behavior

Dark mode applies theme-specific color overrides through `[data-theme="dark"]` selectors. When implementing new features:

1. Always test both light and dark modes
2. Use CSS variables instead of hardcoded colors
3. The system automatically handles theme switching
4. Additional dark-mode-specific utilities are provided in the CSS for edge cases

---

## Future Extensions

The system is designed to be extensible. To add new semantic colors:

1. Define new CSS variables in both `:root` and `[data-theme="dark"]`
2. Include light, lighter, dark, and surface variants
3. Add utility classes as needed
4. Update this documentation

Example:
```css
:root {
  --secondary: #06B6D4;
  --secondary-light: #22D3EE;
  --secondary-lighter: #CFFAFE;
  --secondary-dark: #0891B2;
  --secondary-surface: #F0F9FA;
}
```

---

## Quick Reference

### Most Common Variables
- Text: `--text`, `--text-tertiary`, `--text-disabled`
- Background: `--bg`, `--card`, `--card-hover`
- Border: `--border`
- Actions: `--accent`, `--success`, `--danger`
- Tables: `--table-header-bg`, `--table-row-hover`, `--table-border`

### Most Common Utility Classes
- `.text-primary`, `.text-secondary`, `.text-tertiary`, `.text-quaternary`
- `.badge-primary`, `.badge-success`, `.badge-danger`
- `.surface-accent`, `.surface-success`, `.surface-danger`
- `.icon-primary`, `.icon-secondary`, `.icon-accent`
- `.border-primary`, `.border-secondary`, `.border-subtle`

---

## Questions?

For color-related issues or requests, refer to this document and the CSS variables defined in [src/index.css](src/index.css).
