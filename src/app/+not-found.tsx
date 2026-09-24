import { Link } from 'expo-router';

import { FullScreen } from '@/components/full-screen';
import { Txt } from '@/components/ui';
import { useT } from '@/providers/settings';

export default function NotFound() {
  const t = useT();
  return (
    <FullScreen>
      <Txt variant="title" color="navy" accessibilityRole="header">
        {t('notFound.title')}
      </Txt>
      <Link href="/" style={{ minHeight: 44 }}>
        <Txt variant="bodyStrong" color="navy">
          {t('notFound.home')}
        </Txt>
      </Link>
    </FullScreen>
  );
}
