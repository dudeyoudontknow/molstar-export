/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Link, Structure, StructureElement, Unit } from 'mol-model/structure';
import { ComplexVisual } from '../representation';
import { VisualUpdateState } from '../../util';
import { createLinkCylinderMesh, LinkIterator, LinkCylinderParams } from './util/link';
import { Vec3 } from 'mol-math/linear-algebra';
import { Loci, EmptyLoci } from 'mol-model/loci';
import { ComplexMeshVisual, ComplexMeshParams } from '../complex-visual';
import { Interval, OrderedSet } from 'mol-data/int';
import { BitFlags } from 'mol-util';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { Mesh } from 'mol-geo/geometry/mesh/mesh';
import { PickingId } from 'mol-geo/geometry/picking';
import { VisualContext } from 'mol-repr/visual';
import { Theme } from 'mol-theme/theme';

const tmpRefPosLinkIt = new Link.ElementLinkIterator()
function setRefPosition(pos: Vec3, structure: Structure, unit: Unit.Atomic, index: StructureElement.UnitIndex) {
    tmpRefPosLinkIt.setElement(structure, unit, index)
    while (tmpRefPosLinkIt.hasNext) {
        const bA = tmpRefPosLinkIt.move()
        bA.otherUnit.conformation.position(bA.otherUnit.elements[bA.otherIndex], pos)
        return pos
    }
    return null
}

function createInterUnitLinkCylinderMesh(ctx: VisualContext, structure: Structure, theme: Theme, props: PD.Values<InterUnitLinkParams>, mesh?: Mesh) {
    const links = structure.interUnitLinks
    const { edgeCount, edges } = links
    const { sizeFactor, sizeAspectRatio } = props

    if (!edgeCount) return Mesh.createEmpty(mesh)

    const location = StructureElement.create()
    const vRef = Vec3.zero()

    const builderProps = {
        linkCount: edgeCount,
        referencePosition: (edgeIndex: number) => {
            const b = edges[edgeIndex]
            let unitA: Unit, unitB: Unit
            let indexA: StructureElement.UnitIndex, indexB: StructureElement.UnitIndex
            if (b.unitA.id < b.unitB.id) {
                unitA = b.unitA, unitB = b.unitB
                indexA = b.indexA, indexB = b.indexB
            } else if (b.unitA.id > b.unitB.id) {
                unitA = b.unitB, unitB = b.unitA
                indexA = b.indexB, indexB = b.indexA
            } else {
                throw new Error('same units in createInterUnitLinkCylinderMesh')
            }
            return setRefPosition(vRef, structure, unitA, indexA) || setRefPosition(vRef, structure, unitB, indexB)
        },
        position: (posA: Vec3, posB: Vec3, edgeIndex: number) => {
            const b = edges[edgeIndex]
            const uA = b.unitA, uB = b.unitB
            uA.conformation.position(uA.elements[b.indexA], posA)
            uB.conformation.position(uB.elements[b.indexB], posB)
        },
        order: (edgeIndex: number) => edges[edgeIndex].props.order,
        flags: (edgeIndex: number) => BitFlags.create(edges[edgeIndex].props.flag),
        radius: (edgeIndex: number) => {
            const b = edges[edgeIndex]
            location.unit = b.unitA
            location.element = b.unitA.elements[b.indexA]
            return theme.size.size(location) * sizeFactor * sizeAspectRatio
        }
    }

    return createLinkCylinderMesh(ctx, builderProps, props, mesh)
}

export const InterUnitLinkParams = {
    ...ComplexMeshParams,
    ...LinkCylinderParams,
    sizeFactor: PD.Numeric(0.3, { min: 0, max: 10, step: 0.01 }),
    sizeAspectRatio: PD.Numeric(2/3, { min: 0, max: 3, step: 0.01 }),
}
export type InterUnitLinkParams = typeof InterUnitLinkParams

export function InterUnitLinkVisual(materialId: number): ComplexVisual<InterUnitLinkParams> {
    return ComplexMeshVisual<InterUnitLinkParams>({
        defaultProps: PD.getDefaultValues(InterUnitLinkParams),
        createGeometry: createInterUnitLinkCylinderMesh,
        createLocationIterator: LinkIterator.fromStructure,
        getLoci: getLinkLoci,
        eachLocation: eachLink,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<InterUnitLinkParams>, currentProps: PD.Values<InterUnitLinkParams>) => {
            state.createGeometry = (
                newProps.sizeFactor !== currentProps.sizeFactor ||
                newProps.sizeAspectRatio !== currentProps.sizeAspectRatio ||
                newProps.radialSegments !== currentProps.radialSegments ||
                newProps.linkScale !== currentProps.linkScale ||
                newProps.linkSpacing !== currentProps.linkSpacing
            )
        }
    }, materialId)
}

function getLinkLoci(pickingId: PickingId, structure: Structure, id: number) {
    const { objectId, groupId } = pickingId
    if (id === objectId) {
        const bond = structure.interUnitLinks.edges[groupId]
        return Link.Loci(structure, [
            Link.Location(
                bond.unitA, bond.indexA as StructureElement.UnitIndex,
                bond.unitB, bond.indexB as StructureElement.UnitIndex
            ),
            Link.Location(
                bond.unitB, bond.indexB as StructureElement.UnitIndex,
                bond.unitA, bond.indexA as StructureElement.UnitIndex
            )
        ])
    }
    return EmptyLoci
}

function eachLink(loci: Loci, structure: Structure, apply: (interval: Interval) => boolean) {
    let changed = false
    if (Link.isLoci(loci)) {
        if (!Structure.areEquivalent(loci.structure, structure)) return false
        for (const b of loci.links) {
            const idx = structure.interUnitLinks.getBondIndexFromLocation(b)
            if (idx !== -1) {
                if (apply(Interval.ofSingleton(idx))) changed = true
            }
        }
    } else if (StructureElement.isLoci(loci)) {
        if (!Structure.areEquivalent(loci.structure, structure)) return false
        if (loci.elements.length === 1) return false // only a single unit

        const map = new Map<number, OrderedSet<StructureElement.UnitIndex>>()
        for (const e of loci.elements) map.set(e.unit.id, e.indices)

        for (const e of loci.elements) {
            const { unit } = e
            if (!Unit.isAtomic(unit)) continue
            structure.interUnitLinks.getLinkedUnits(unit).forEach(b => {
                const otherLociIndices = map.get(b.unitB.id)
                if (otherLociIndices) {
                    OrderedSet.forEach(e.indices, v => {
                        if (!b.connectedIndices.includes(v)) return
                        b.getEdges(v).forEach(bi => {
                            if (OrderedSet.has(otherLociIndices, bi.indexB)) {
                                const idx = structure.interUnitLinks.getEdgeIndex(v, unit, bi.indexB, b.unitB)
                                if (apply(Interval.ofSingleton(idx))) changed = true
                            }
                        })
                    })
                }
            })
        }
    }
    return changed
}