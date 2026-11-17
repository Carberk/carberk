import type { View } from 'react-native';

import { Pulse } from '@/components/ui/motion';
import { cn } from '@/lib/utils';







function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <Pulse className={cn('bg-accent rounded-md', className)} {...props} />;
}

export { Skeleton };
