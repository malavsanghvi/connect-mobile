import { Redirect } from 'expo-router';

/**
 * https://app.weaverams.org/demo (and connect://demo) is the address of "Try the demo". The chooser itself is drawn by the root layout
 * (src/app/_layout.tsx, from the demo provider), because it has to appear before any community is chosen, when no navigator exists
 * yet. This route only makes `/demo` a real address; once the navigator is up, it is already past the chooser, so go to the app.
 */
export default function DemoRoute() {
  return <Redirect href="/" />;
}
