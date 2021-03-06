/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Column, Table } from '../../mol-data/db';
import { Model, Symmetry } from '../../mol-model/structure/model';
import { MoleculeType } from '../../mol-model/structure/model/types';
import { RuntimeContext, Task } from '../../mol-task';
import { createModels } from './basic/parser';
import { BasicSchema, createBasic } from './basic/schema';
import { ComponentBuilder } from './common/component';
import { EntityBuilder } from './common/entity';
import { ModelFormat } from './format';
import { CifCore_Database } from '../../mol-io/reader/cif/schema/cif-core';
import { CifFrame, CIF } from '../../mol-io/reader/cif';
import { Spacegroup, SpacegroupCell } from '../../mol-math/geometry';
import { Vec3 } from '../../mol-math/linear-algebra';
import { ModelSymmetry } from './property/symmetry';
import { IndexPairBonds } from './property/bonds/index-pair';

function getSpacegroupNameOrNumber(space_group: CifCore_Database['space_group']) {
    const groupNumber = space_group.IT_number.value(0)
    const groupName = space_group['name_H-M_full'].value(0)
    if (!space_group.IT_number.isDefined) return groupName
    if (!space_group['name_H-M_full'].isDefined) return groupNumber
    return groupNumber
}

function getSymmetry(db: CifCore_Database): Symmetry {
    const { cell, space_group } = db
    const nameOrNumber = getSpacegroupNameOrNumber(space_group)
    const spaceCell = SpacegroupCell.create(nameOrNumber,
        Vec3.create(cell.length_a.value(0), cell.length_b.value(0), cell.length_c.value(0)),
        Vec3.scale(Vec3.zero(), Vec3.create(cell.angle_alpha.value(0), cell.angle_beta.value(0), cell.angle_gamma.value(0)), Math.PI / 180));

    return {
        spacegroup: Spacegroup.create(spaceCell),
        assemblies : [],
        isNonStandardCrytalFrame: false,
        ncsOperators: []
    }
}

async function getModels(db: CifCore_Database, format: CifCoreFormat, ctx: RuntimeContext): Promise<Model[]> {

    const atomCount = db.atom_site._rowCount
    const MOL = Column.ofConst('MOL', atomCount, Column.Schema.str);
    const A = Column.ofConst('A', atomCount, Column.Schema.str);
    const seq_id = Column.ofConst(1, atomCount, Column.Schema.int);

    const symmetry = getSymmetry(db)
    const m = symmetry.spacegroup.cell.fromFractional

    const { fract_x, fract_y, fract_z } = db.atom_site
    const x = new Float32Array(atomCount)
    const y = new Float32Array(atomCount)
    const z = new Float32Array(atomCount)
    const v = Vec3()
    for (let i = 0; i < atomCount; ++i) {
        Vec3.set(v, fract_x.value(i), fract_y.value(i), fract_z.value(i))
        Vec3.transformMat4(v, v, m)
        x[i] = v[0], y[i] = v[1], z[i] = v[2]
    }

    const atom_site = Table.ofPartialColumns(BasicSchema.atom_site, {
        auth_asym_id: A,
        auth_atom_id: db.atom_site.label,
        auth_comp_id: MOL,
        auth_seq_id: seq_id,
        Cartn_x: Column.ofFloatArray(x),
        Cartn_y: Column.ofFloatArray(y),
        Cartn_z: Column.ofFloatArray(z),
        id: Column.range(0, atomCount - 1),

        label_asym_id: A,
        label_atom_id: db.atom_site.label,
        label_comp_id: MOL,
        label_seq_id: seq_id,
        label_entity_id: Column.ofConst('1', atomCount, Column.Schema.str),

        occupancy: db.atom_site.occupancy,
        type_symbol: db.atom_site.type_symbol,

        pdbx_PDB_model_num: Column.ofConst(1, atomCount, Column.Schema.int),
    }, atomCount);

    const name = db.chemical.name_common.value(0) || db.chemical.name_systematic.value(0)

    const entityBuilder = new EntityBuilder()
    entityBuilder.setNames([['MOL', name || 'Unknown Entity']])
    entityBuilder.getEntityId('MOL', MoleculeType.Unknown, 'A');

    const componentBuilder = new ComponentBuilder(seq_id, db.atom_site.type_symbol);
    componentBuilder.setNames([['MOL', name || 'Unknown Molecule']])
    componentBuilder.add('MOL', 0);

    const basics = createBasic({
        entity: entityBuilder.getEntityTable(),
        chem_comp: componentBuilder.getChemCompTable(),
        atom_site
    });

    const models = await createModels(basics, format, ctx);

    if (models.length > 0) {
        ModelSymmetry.Provider.set(models[0], symmetry)

        const bondCount = db.geom_bond._rowCount
        if(bondCount > 0) {
            const labelIndexMap: { [label: string]: number } = {}
            const { label } = db.atom_site
            for (let i = 0, il = label.rowCount; i < il; ++i) {
                labelIndexMap[label.value(i)] = i
            }

            const indexA: number[] = []
            const indexB: number[] = []
            const order: number[] = []

            const { atom_site_label_1, atom_site_label_2, valence, site_symmetry_1, site_symmetry_2 } = db.geom_bond
            for (let i = 0; i < bondCount; ++i) {
                if (site_symmetry_1.value(i) === site_symmetry_2.value(i)) {
                    indexA[i] = labelIndexMap[atom_site_label_1.value(i)]
                    indexB[i] = labelIndexMap[atom_site_label_2.value(i)]
                    // TODO derive from bond length if undefined
                    order[i] = valence.isDefined ? valence.value(i) : 1
                }
            }

            // TODO support symmetry
            IndexPairBonds.Provider.set(models[0], IndexPairBonds.fromData({ pairs: {
                indexA: Column.ofIntArray(indexA),
                indexB: Column.ofIntArray(indexB),
                order: Column.ofIntArray(order)
            }, count: indexA.length }));
        }
    }

    return models;
}

//

export { CifCoreFormat };

type CifCoreFormat = ModelFormat<CifCoreFormat.Data>

namespace CifCoreFormat {
    export type Data = { db: CifCore_Database, frame: CifFrame }
    export function is(x: ModelFormat): x is CifCoreFormat {
        return x.kind === 'cifCore'
    }

    export function fromFrame(frame: CifFrame, db?: CifCore_Database): CifCoreFormat {
        if (!db) db = CIF.schema.cifCore(frame)
        return { kind: 'cifCore', name: db._name, data: { db, frame } };
    }
}

export function trajectoryFromCifCore(frame: CifFrame): Task<Model.Trajectory> {
    const format = CifCoreFormat.fromFrame(frame)
    return Task.create('Parse CIF Core', ctx => getModels(format.data.db, format, ctx))
}
