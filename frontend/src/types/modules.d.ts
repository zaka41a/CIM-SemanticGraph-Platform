// Type declarations for modules without @types packages

declare module 'react-cytoscapejs' {
  import { ComponentType } from 'react';
  import cytoscape from 'cytoscape';

  interface CytoscapeComponentProps {
    elements: any[];
    style?: React.CSSProperties;
    stylesheet?: any[];
    layout?: any;
    cy?: (cy: cytoscape.Core) => void;
    [key: string]: any;
  }

  const CytoscapeComponent: ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}

declare module 'cytoscape-dagre' {
  import cytoscape from 'cytoscape';
  const cytoscapeDagre: cytoscape.Ext;
  export default cytoscapeDagre;
}

// Vite env types
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_ANALYTICS_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
