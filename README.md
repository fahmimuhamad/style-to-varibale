# Style to Variable Converter - Figma Plugin

A powerful Figma plugin that scans your entire file for color styles and helps you convert them to color variables automatically.

## Features

- **Comprehensive Scanning**: Scans all pages, components, text, and elements in your Figma file for color style usage
- **Smart Matching**: Automatically finds matching color variables with the same name as your styles
- **Batch Conversion**: Select multiple styles and convert them all at once
- **Visual Preview**: See style colors and match status before converting
- **Usage Statistics**: View how many times each style is used in your file

## How to Use

### Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. In Figma:
   - Go to **Plugins** → **Development** → **Import plugin from manifest...**
   - Select the `manifest.json` file from this project

### Using the Plugin

1. **Open your Figma file** that contains color styles you want to convert

2. **Run the plugin**:
   - Go to **Plugins** → **Development** → **Style to Variable Converter**

3. **Scan your file**:
   - Click the "Scan File" button
   - The plugin will analyze all elements in your file

4. **Review detected styles**:
   - Styles are grouped into two sections:
     - **Styles with Matching Variables**: These can be converted (shown with green indicator)
     - **Styles without Matching Variables**: These need manual variable creation first

5. **Select and convert**:
   - Check the boxes next to the styles you want to convert
   - Click "Replace Selected" to convert them to variables
   - The plugin will update all instances automatically

## How It Works

### Scanning Process

The plugin recursively traverses your entire Figma file looking for:
- Fill styles on shapes, frames, and components
- Stroke styles on elements
- Effect styles (shadows, blurs, etc.)

### Matching Logic

The plugin matches styles to variables using:
1. **Exact name match**: Style name exactly matches variable name
2. **Base name match**: Last part of the name after "/" matches (e.g., "Colors/Primary" matches variable "Primary")

### Conversion Process

When converting:
1. The plugin binds the matching color variable to the element
2. Removes the style reference
3. Preserves all other properties of the element

## Development

### Project Structure

```
src/
├── code.ts              # Main plugin logic (runs in Figma)
├── ui.tsx              # React UI entry point
├── types.ts            # TypeScript interfaces
├── index.css           # Tailwind CSS styles
└── components/
    ├── App.tsx         # Main app component
    ├── StyleList.tsx   # List of styles
    └── StyleItem.tsx   # Individual style card
```

### Scripts

- `npm run build` - Build for production
- `npm run dev` - Build and watch for changes
- `npm run typecheck` - Run TypeScript type checking

### Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Webpack** - Bundling
- **Lucide React** - Icons

## Tips

1. **Create variables first**: For best results, create color variables before running the plugin
2. **Use consistent naming**: Name your variables the same as your styles for automatic matching
3. **Backup your work**: Always save a copy of your file before batch converting
4. **Review changes**: After conversion, check a few elements to ensure the colors are correct

## Limitations

- Only works with color styles (fill, stroke, effects)
- Requires exact or close name matching for automatic detection
- Does not handle text styles or other non-color properties
- Locked layers are skipped during scanning and conversion

## License

MIT
