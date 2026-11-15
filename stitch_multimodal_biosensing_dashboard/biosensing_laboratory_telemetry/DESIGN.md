---
name: Biosensing Laboratory Telemetry
colors:
  surface: '#061520'
  surface-dim: '#061520'
  surface-bright: '#2c3b47'
  surface-container-lowest: '#020f1b'
  surface-container-low: '#0e1d29'
  surface-container: '#12212d'
  surface-container-high: '#1d2b38'
  surface-container-highest: '#283643'
  on-surface: '#d5e4f5'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#d5e4f5'
  inverse-on-surface: '#24323e'
  outline: '#8c909f'
  outline-variant: '#424753'
  surface-tint: '#aec6ff'
  primary: '#aec6ff'
  on-primary: '#002e6a'
  primary-container: '#4e8eff'
  on-primary-container: '#00275d'
  inverse-primary: '#005ac3'
  secondary: '#c7bfff'
  on-secondary: '#2a039d'
  secondary-container: '#422db2'
  on-secondary-container: '#b4abff'
  tertiary: '#3cddc7'
  on-tertiary: '#003731'
  tertiary-container: '#00a392'
  on-tertiary-container: '#00302a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#aec6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#e4dfff'
  secondary-fixed-dim: '#c7bfff'
  on-secondary-fixed: '#170065'
  on-secondary-fixed-variant: '#422db2'
  tertiary-fixed: '#62fae3'
  tertiary-fixed-dim: '#3cddc7'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005047'
  background: '#061520'
  on-background: '#d5e4f5'
  surface-variant: '#283643'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  mono-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.03em
  mono-metric-md:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.02em
  mono-data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  mono-label-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers an advanced, high-precision laboratory environment calibrated for multimodal physiological telemetry. The aesthetic balances analytical rigor with human-centric ergonomics: complex biosignals (electroencephalography, photoplethysmography, inertial motion tracking, and core thermometry) are presented with crystal-clear legibility and structural discipline without feeling clinical or punishing.

### Personality & Emotional Tenor
- **Analytical & Precise:** Information density is intentional, structured, and prioritized. Data streams speak directly through uniform geometric metrics and tabular baselines.
- **Approachable & Trustworthy:** Friendly ergonomics are achieved via balanced optical rhythm, comfortable interactive touchpoints, rounded functional frames, and vivid chromatic mapping rather than oppressive dark-terminal brutalism.
- **Instrumental Modernism:** Combines crisp mechanical typography, telemetry dashboards, and reactive visual feedback inspired by aerospace monitoring consoles and medical research instrumentation.

### Target Audience
Neuroscientists, biomedical engineers, clinical trial operators, and human-computer interaction (HCI) researchers monitoring live multi-channel sensor arrays simultaneously.

## Colors

The palette operates under a default dark-mode paradigm designed for prolonged monitoring in low-glare lab environments, backed by an accessible, surgical light-mode pairing for daylight research settings.

### Base Surface Architecture (Dark Mode)
- **App Canvas / Ground:** `#0B0F14` (Deep obsidian navy, minimizes optical fatigue)
- **Surface Elevation 1 (Cards, panels):** `#121A23`
- **Surface Elevation 2 (Sub-panels, nested modules, popovers):** `#182330`
- **Subtle Surface (Hover states, table rows):** `#1E2C3D`
- **Structural Border:** `#1F2B38` (1px clean boundary definition)
- **Primary Text:** `#E6EDF3` (Crisp readability, AAA compliant against dark surfaces)
- **Muted Text / Metadata:** `#8B9AA9`
- **Ghost / Inactive Text:** `#536375`

### Primary Functional Accent
- **Action / Interactive Blue:** `#4C8DFF` (Used for system triggers, active run state, global filters, and focal targets)
- **Action Hover / Pressed:** `#3B75DE` / `#609AFF`

### Multimodal Sensor Semantic Palette
Dedicated chromatic anchors assign a permanent identity to discrete biosensor modalities, preventing cognitive strain across dense charts and variable matrices:
- **EEG (Electroencephalography):** `#8B7CFF` (Electric Violet)
- **PPG (Photoplethysmography / Blood Pulse):** `#FF5C6C` (Crimson Carmine)
- **IMU (Inertial Measurement Unit / Kinematics):** `#2DD4BF` (Bioluminescent Teal)
- **Temperature (Thermometry):** `#FFB547` (Calibrated Amber)

### Operational State Signals
- **Nominal / Connected:** `#2DD4BF`
- **Warning / Impedance High:** `#FFB547`
- **Critical / Lead-Off / Clipping:** `#FF5C6C`
- **Syncing / Telemetry Stream:** `#4C8DFF`

### Light Theme Counterpart Reference
- **App Canvas:** `#F4F7FB`
- **Surface Cards:** `#FFFFFF` with 1px border `#D7E1EA`
- **Primary Text:** `#0D1520`
- **Muted Text:** `#57687B`
- **Modality Tints:** Sensor accents shift to deep laboratory variants (EEG: `#6452E9`, PPG: `#E03648`, IMU: `#0D9488`, Temp: `#D97706`).

## Typography

The typography system applies strict structural bifurcation between human-interface chrome and analytical telemetry:

1. **Inter** serves all global navigation, modals, contextual explanations, form prompts, and narrative statuses. It provides warm, clean geometric legibility without idiosyncratic distractions.
2. **JetBrains Mono** governs the entire laboratory datastream: numerical readout values, timestamp matrices, sensor sample rates (Hz), microvolt (µV) ratings, formulas, filter parameters, and tabular cells.

### Rules of Usage
- **Tabular Lining:** Always activate `font-variant-numeric: tabular-nums` across numeric displays to guarantee that dynamic readouts do not jitter or cause layout shift during high-frequency streaming.
- **Formula Blocks:** Mathematical representations and biosensing calculations (e.g., Fast Fourier Transform windows, heart rate variability RMSSD, quaternion rotational velocity) must render in `JetBrains Mono` with variable names visually color-coded according to the sensor accent palette.
- **Labels and Units:** Physical units (`mV`, `bpm`, `°C`, `g`, `kΩ`) must sit adjacent to metrics using `mono-label-xs` or `mono-data-sm` styled in muted `#8B9AA9`.

## Layout & Spacing

The layout is built for data-dense telemetry dashboards, employing a continuous fluid grid architecture optimized for widescreen multi-sensor oversight.

### Grid & Canvas Structure
- **Desktop (>= 1280px):** 12-column or 16-column flexible dashboard layout. Outer margins are locked at `1.5rem` (`margin`), with `1rem` column gutters (`gutter`). Dense visualization zones (such as simultaneous 8-channel EEG microvolt traces) collapse down to `gutter-dense` (`0.75rem`) to maximize visual resolution.
- **Tablet (768px - 1279px):** 8-column layout. Charts and signal channels stack vertically or pair into 2-up grids. Modality sidebars collapse into persistent icon-rail overlays.
- **Mobile (< 768px):** 4-column layout with `1rem` canvas margins. Numerical telemetry cards take precedence; raw waveform strip-charts degrade to touch-scrub sparklines or switch to single-channel selection tabs.

### Internal Spacing Rhythm
- Compact internal component gaps use `space-xs` (4px) and `space-sm` (8px) for tightly coupled units, such as numerical indicators paired with confidence badges or formula parameter tags.
- Structural card padding uses `space-md` (12px) for high-density sensor grids or `space-lg` (16px) for master analytic cards. Section transitions enforce `space-xl` (24px).

## Elevation & Depth

Visual hierarchy within this design system relies on clean low-contrast outlines and tonal surface stratification instead of heavy dropped shadows, keeping real-time rendering fast and waveforms crisp.

### Surface Tiers & Layering
1. **Canvas (`#0B0F14`):** Base environment backdrop. Contains global navigation rails, system breadcrumbs, and overall run controls.
2. **Standard Surface (`#121A23`):** Primary sensor cards, waveform monitors, and telemetry tables. Outlined with a continuous crisp `1px solid #1F2B38`.
3. **Elevated Surface (`#182330`):** Flyout drawers, dynamic filter inspect menus, impedance configuration popovers, and contextual dropdowns. Border shifts to `1px solid #2B3A4C`.
4. **Transient Modals:** Positioned atop a high-density scrim (`rgba(11, 15, 20, 0.75)` with `backdrop-filter: blur(4px)`).

### Ambient Illumination & Sensor Glow
Traditional dark shadows are replaced with faint, color-tinted ambient sensor glows:
- When a sensor channel triggers an anomaly, is selected, or hovers, the card receives a 1px border highlight matching that sensor’s hex along with an ultra-subtle exterior ambient glow: `box-shadow: 0 0 16px -2px rgba(color, 0.20)`.
- Standard idle cards feature no blur shadow, preserving razor-sharp boundaries across densely gridded monitors.

## Shapes

The shape system adopts a deliberate 12px primary baseline (`roundedness: 2`, where component radius is scaled to `0.75rem` / `12px` for parent cards), providing a comfortable, modern ergonomic feel that counterbalances raw telemetry data.

### Corner Curvature Rules
- **Parent Cards & Waveform Containers:** Fixed at `12px` radius. Creates distinct modular windows that enclose dense signal charts comfortably.
- **Interactive Controls (Buttons, Inputs, Selectors):** `8px` (`rounded-sm` / `space-sm`) radius, creating crisp and quickly identifiable clickable targets.
- **Pills, Badges & Channel Indicators:** Fully rounded (`rounded-full` / `9999px`) for status dots, modality filter toggles, electrode impedance state chips, and unit labels.
- **Formula Blocks & Raw Data Tables:** `8px` or `12px` exterior borders, with flat `0px` internal cell dividers to maintain strict alignment of data matrices.

## Components

### Buttons & Interactive Controls
- **Primary Action Button:** Solid `#4C8DFF` with `#FFFFFF` text, `8px` border radius, font `Inter` 13px medium. On hover: shifts to `#3B75DE`. Focus ring: 2px offset glow in `rgba(76, 141, 255, 0.4)`.
- **Secondary / Ghost Button:** Background transparent, border `1px solid #1F2B38`, text `#E6EDF3`. Hover introduces background `#182330` and border `#2B3A4C`.
- **Sensor Channel Toggle Button:** Includes a modality indicator dot (`6px` circle with sensor accent) followed by channel name (e.g., `Ch 1 - Cz`). Active state engages a tint wash (`rgba(accent, 0.12)`) and accent border.

### Sensor Chips & Status Badges
- **Modality Badges (EEG, PPG, IMU, TEMP):** Small rounded pills (`height: 22px`), `JetBrains Mono` 10px uppercase bold. Composed of a solid tinted background (`rgba(sensor-color, 0.15)`), sensor-colored text, and an optional pulsing live-stream dot (`4px`).
- **Impedance Status Indicator:** Displays electrode contact quality (`Good < 5kΩ`, `Fair < 10kΩ`, `Poor > 10kΩ`) using respective nominal (`#2DD4BF`), warning (`#FFB547`), or critical (`#FF5C6C`) tokens in tabular monospace.

### Waveform & Telemetry Cards
- **Structure:** Surface `#121A23`, border `1px solid #1F2B38`, border-radius `12px`, padding `12px 16px`.
- **Header:** Displays modality chip, channel designation in `JetBrains Mono`, sample frequency (e.g., `250 Hz`), and dynamic scalar readout (e.g., `±50 µV`).
- **Canvas Body:** Dedicated plot area with a faint horizontal grid (`1px dashed #182330`). Signal traces render at `1.5px` stroke weight using the assigned sensor accent color.

### Monospace Formula Blocks & Variable Tables
- **Formula Container:** Styled in `#0E141C` (recessed background), framed with `1px solid #1F2B38`, radius `8px`, and padding `12px`.
- **Typography & Syntax:** Center-aligned or left-aligned mathematical representations in `JetBrains Mono` 13px. Symbols like `∑`, `∫`, `√` render in muted text (`#8B9AA9`), while live sensor inputs reflect their respective sensor colors.
- **Variable Legend Table:** Sits flush below the formula block with minimal divider lines (`#182330`). 
  - Column 1: Variable token (e.g., `PPG_AC`, `τ_window`, `IMU_ωz`).
  - Column 2: Definition string in `Inter` 12px.
  - Column 3: Live real-time scalar value in `JetBrains Mono` 12px.

### Input Fields & Data Selectors
- **Input Ground:** Background `#0E141C`, border `1px solid #1F2B38`, text `#E6EDF3`, height `36px`, radius `8px`.
- **Active / Focused:** Border transitions to `#4C8DFF` with no outline jitter.
- **Numeric Steppers (Gain, Notch Filter, Hz):** Number input paired with monospaced increment/decrement buttons integrated directly into the right edge of the input.

### Checkboxes & Radio Switches
- **Form Factor:** `16px` squared inputs with `4px` corner radii for checkboxes; circular for radios.
- **State Styling:** Border `1.5px solid #2B3A4C`. When selected, fills `#4C8DFF` displaying a sharp white tick mark.
- **Sensor Multiselect Group:** Sensor channel checkboxes adapt their checked fill to their assigned modality color (e.g., EEG channel checkboxes check violet, PPG check red).