import React from 'react';
import SiaraMap from './SiaraMap';

const MapCanvas = React.forwardRef(function MapCanvas(props, ref) {
  return <SiaraMap ref={ref} {...props} />;
});

export default MapCanvas;
