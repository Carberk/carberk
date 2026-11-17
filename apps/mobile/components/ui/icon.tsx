import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import * as React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { cn } from '@/lib/utils';
import { TextClassContext } from '@/components/ui/text';

type IconProps = LucideProps & {
  as: LucideIcon;
  className?: string;
} & React.RefAttributes<LucideIcon>;

type IconStyle = ViewStyle & {
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number | string;
};

type IconImplProps = Omit<IconProps, 'style' | 'fill' | 'stroke'> & {
  style?: StyleProp<IconStyle>;
  fill?: LucideProps['fill'];
  stroke?: LucideProps['stroke'];
};

function numberStyle(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringStyle(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function IconImpl({
  as: IconComponent,
  color,
  fill,
  size,
  stroke,
  strokeWidth,
  style,
  ...props
}: IconImplProps) {
  const flattenedStyle = StyleSheet.flatten(style);
  const styleSize =
    numberStyle(flattenedStyle?.width) ?? numberStyle(flattenedStyle?.height);
  const styleColor = stringStyle(flattenedStyle?.color);
  const styleFill = stringStyle(flattenedStyle?.fill);
  const styleStroke = stringStyle(flattenedStyle?.stroke);
  const styleStrokeWidth =
    numberStyle(flattenedStyle?.strokeWidth) ??
    stringStyle(flattenedStyle?.strokeWidth);

  return (
    <IconComponent
      color={stroke ?? styleStroke ?? color ?? styleColor}
      fill={fill ?? styleFill ?? 'none'}
      size={styleSize ?? size ?? 14}
      strokeWidth={strokeWidth ?? styleStrokeWidth}
      {...props}
    />
  );
}

cssInterop(IconImpl, {
  className: 'style',
});





















function Icon({ as: IconComponent, className, size, ...props }: IconProps) {
  const textClass = React.useContext(TextClassContext);

  return (
    <IconImpl
      as={IconComponent}
      className={cn('text-foreground', textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };
