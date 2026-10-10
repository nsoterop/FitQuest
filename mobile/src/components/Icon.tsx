import { Image } from 'react-native';
import icon0_20 from '../../assets/icons/sun-20.png';
import icon0_24 from '../../assets/icons/sun-24.png';
import icon1_20 from '../../assets/icons/calendar-days-20.png';
import icon1_24 from '../../assets/icons/calendar-days-24.png';
import icon2_20 from '../../assets/icons/utensils-20.png';
import icon2_24 from '../../assets/icons/utensils-24.png';
import icon3_20 from '../../assets/icons/chart-column-20.png';
import icon3_24 from '../../assets/icons/chart-column-24.png';
import icon4_20 from '../../assets/icons/user-round-20.png';
import icon4_24 from '../../assets/icons/user-round-24.png';
import icon5_20 from '../../assets/icons/chevron-left-20.png';
import icon5_24 from '../../assets/icons/chevron-left-24.png';
import icon6_20 from '../../assets/icons/chevron-right-20.png';
import icon6_24 from '../../assets/icons/chevron-right-24.png';
import icon7_20 from '../../assets/icons/chevron-down-20.png';
import icon7_24 from '../../assets/icons/chevron-down-24.png';
import icon8_20 from '../../assets/icons/chevron-up-20.png';
import icon8_24 from '../../assets/icons/chevron-up-24.png';
import icon9_20 from '../../assets/icons/ellipsis-20.png';
import icon9_24 from '../../assets/icons/ellipsis-24.png';
import icon10_20 from '../../assets/icons/square-20.png';
import icon10_24 from '../../assets/icons/square-24.png';
import icon11_20 from '../../assets/icons/square-check-20.png';
import icon11_24 from '../../assets/icons/square-check-24.png';
const assets = {
  sun: { 20: icon0_20, 24: icon0_24 },
  'calendar-days': { 20: icon1_20, 24: icon1_24 },
  utensils: { 20: icon2_20, 24: icon2_24 },
  'chart-column': { 20: icon3_20, 24: icon3_24 },
  'user-round': { 20: icon4_20, 24: icon4_24 },
  'chevron-left': { 20: icon5_20, 24: icon5_24 },
  'chevron-right': { 20: icon6_20, 24: icon6_24 },
  'chevron-down': { 20: icon7_20, 24: icon7_24 },
  'chevron-up': { 20: icon8_20, 24: icon8_24 },
  ellipsis: { 20: icon9_20, 24: icon9_24 },
  square: { 20: icon10_20, 24: icon10_24 },
  'square-check': { 20: icon11_20, 24: icon11_24 },
};
export type IconName = keyof typeof assets;
export function Icon({
  name,
  size = 20,
  color = '#626670',
}: {
  name: IconName;
  size?: 20 | 24;
  color?: string;
}) {
  return (
    <Image
      source={assets[name][size]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      resizeMode="contain"
      style={{ width: size, height: size, flexShrink: 0, tintColor: color }}
    />
  );
}
