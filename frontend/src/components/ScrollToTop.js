import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router does not reset scroll position on navigation (unlike a
// classic multi-page site). Without this, navigating from a scrolled-down
// list (e.g. "Add School" from partway down the schools list on mobile)
// lands on the new page already scrolled to the same offset, which reads
// as a broken/glitchy popup rather than a fresh page.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
