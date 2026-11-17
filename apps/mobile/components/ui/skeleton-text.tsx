import { View, type DimensionValue } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';







function SkeletonText({
  className,
  width,
  testID,
}: {
  className: string;
  width: DimensionValue;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{ width }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text className={cn(className, 'opacity-0')}>{'\u00A0'}</Text>
      <Skeleton className="absolute inset-x-0 bottom-1 top-1" />
    </View>
  );
}

export { SkeletonText };
