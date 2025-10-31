const API = 'http://127.0.0.1:8000';

const ACTIONS = [
  { value: 'goto', label: 'Goto URL', needsSelector: false, needsValue: true, valuePlaceholder: 'https://example.com' },
  { value: 'click', label: 'Click', needsSelector: true },
  { value: 'clickPosition', label: 'Click Position (X,Y)', needsSelector: false, needsValue: true, valuePlaceholder: '{"x": 100, "y": 200}', needsPositionPicker: true },
  { value: 'dblclick', label: 'Double click', needsSelector: true },
  { value: 'hover', label: 'Hover', needsSelector: true },
  { value: 'fill', label: 'Fill input', needsSelector: true, needsValue: true, valuePlaceholder: 'text' },
  { value: 'type', label: 'Type (raw)', needsSelector: true, needsValue: true, valuePlaceholder: 'text' },
  { value: 'press', label: 'Press key', needsSelector: true, needsValue: true, valuePlaceholder: 'Enter' },
  { value: 'selectOption', label: 'Select option', needsSelector: true, needsValue: true, valuePlaceholder: 'value' },
  { value: 'waitForVisible', label: 'Wait visible', needsSelector: true },
  { value: 'waitForHidden', label: 'Wait hidden', needsSelector: true },
  { value: 'waitTimeout', label: 'Wait timeout (ms)', needsSelector: false, needsValue: true, valuePlaceholder: '1000' },
  { value: 'expectExists', label: 'Assert exists', needsSelector: true },
  { value: 'expectNotExists', label: 'Assert not exists', needsSelector: true },
  { value: 'expectTextContains', label: 'Assert text contains', needsSelector: true, needsValue: true, valuePlaceholder: 'needle' },
  { value: 'expectUrlMatches', label: 'Assert URL matches (regex)', needsSelector: false, needsValue: true, valuePlaceholder: 'pattern' },
  { value: 'expectTitle', label: 'Assert title', needsSelector: false, needsValue: true, valuePlaceholder: 'title' },
  { value: 'getText', label: 'Get text', needsSelector: true },
  { value: 'getAttribute', label: 'Get attribute (value=attr name)', needsSelector: true, needsValue: true, valuePlaceholder: 'aria-label' },
  { value: 'getValue', label: 'Get value', needsSelector: true },
  { value: 'screenshot', label: 'Screenshot', needsSelector: false },
];

