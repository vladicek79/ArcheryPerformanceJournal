// APL — Archery Performance Journal components (window.APL)
export type IconName = 'back' | 'repeat' | 'calendar' | 'clock' | 'plus' | 'arrowRight' | 'target' | 'bow';
export type FaceKind = 'full' | 'six' | 'triple' | 'vegas';
export interface ButtonProps { children: React.ReactNode; variant?: 'primary' | 'secondary'; trailingIcon?: IconName; disabled?: boolean; type?: 'button' | 'submit'; onClick?: () => void; }
export interface IconButtonProps { icon: IconName; label: string; onClick?: () => void; }
export interface AddButtonProps { children: React.ReactNode; onClick?: () => void; }
export interface ChipProps { children: React.ReactNode; selected?: boolean; numeric?: boolean; onClick?: () => void; }
export interface ChipGridProps { label: string; options: {value: string | number; label: string}[]; value: string | number; onChange: (v) => void; columns?: number; numeric?: boolean; }
export interface OptionPillsProps { label: string; options: {value: string; label: string}[]; value: string; onChange: (v) => void; }
export interface SegmentedControlProps { label: string; options: {value: string | number; label: string}[]; value: string | number; onChange: (v) => void; }
export interface StepperProps { value: number; onChange: (v: number) => void; label?: string; unit?: string; min?: number; max?: number; step?: number; }
export interface SelectCardProps { title: string; detail?: string; selected?: boolean; onClick?: () => void; }
export interface BadgeProps { children: React.ReactNode; tone?: 'accent' | 'neutral'; }
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; }
export interface TargetFaceProps { kind: 'full' | 'six' | 'triple' | 'vegas'; size?: number; }
export interface FaceCardProps { size: 40 | 60 | 80 | 122; kind: 'full' | 'six' | 'triple' | 'vegas'; }
export interface ScreenHeaderProps { title: string; onBack?: () => void | null; trailing?: React.ReactNode; }
export interface SectionProps { label: string; accessory?: React.ReactNode; children: React.ReactNode; }
export interface RepeatCardProps { title: string; summary: string; actionLabel?: string; icon?: IconName; onClick?: () => void; }
export interface FieldButtonProps { value: string; hint?: string; icon?: IconName; onClick?: () => void; }
export interface BottomBarProps { summary?: string; children: React.ReactNode; }
export interface SessionSetupProps { lastSession?: {distance: number; size: number; kind: FaceKind; arrows: number; bow: string}; equipment?: {id: string; name: string; detail?: string}[]; onBack?: () => void; onStart?: (setup) => void; }
