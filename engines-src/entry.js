import {readData,detectFormat,ReadStatType} from '@irbisadm/statfmt';
import {parquetReadObjects,parquetMetadata} from 'hyparquet';
import {pickleText} from './pk.js';
window.TXTLIBS={readData,detectFormat,ReadStatType,parquetReadObjects,parquetMetadata,pickleText};
