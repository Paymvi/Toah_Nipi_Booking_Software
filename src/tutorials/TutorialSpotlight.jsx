import { createPortal } from 'react-dom';

export default function TutorialSpotlight({ rect, demo }) {
  return createPortal(<div className="tn-tour-spotlight" aria-hidden="true">
    {demo && <div className="tn-tour-demo-shield" />}
    {rect ? <>
      <div className="tn-tour-hole" style={{ left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 }} />
      <span className="tn-tour-pointer" style={{ left: Math.max(4, Math.min(window.innerWidth - 32, rect.right + 7)), top: Math.max(4, Math.min(window.innerHeight - 36, rect.top + rect.height / 2 - 14)) }}>◀</span>
    </> : <div className="tn-tour-dimmer" />}
  </div>, document.body);
}
