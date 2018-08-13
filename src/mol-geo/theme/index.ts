/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Color } from 'mol-util/color';
import { Structure } from 'mol-model/structure';

export interface ColorThemeProps {
    name: 'element-index' | 'chain-id'| 'unit-index' | 'uniform' | 'carbohydrate-symbol' | 'element-symbol'
    domain?: [number, number]
    value?: Color
    structure?: Structure
}

export const ColorThemeInfo = {
    'element-index': {},
    'carbohydrate-symbol': {},
    'chain-id': {},
    'element-symbol': {},
    'unit-index': {},
    'uniform': {}
}
export type ColorThemeName = keyof typeof ColorThemeInfo
export const ColorThemeNames = Object.keys(ColorThemeInfo)

export interface UniformSizeTheme {
    name: 'uniform',
    value: number
}

export interface ScaleSizeTheme {
    name: 'physical' // van-der-Waals for atoms, given radius for coarse spheres
    factor?: number // scaling factor
}

export type SizeTheme = UniformSizeTheme | ScaleSizeTheme