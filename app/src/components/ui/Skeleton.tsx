import { HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: boolean | 'full';
}

export function Skeleton({ width, height, rounded, className = '', style, ...rest }: SkeletonProps) {
  const radius = rounded === 'full' ? '9999px' : rounded === false ? '0' : undefined;
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}
