/* Structured advice for every finding the tool can produce.
 *
 * The rules in index.html (and the characterization in characterize.js) keep their own title / detail / fix text.
 * This file adds, per finding, the fields a person needs to act on it:
 *   plain    2-3 sentences, no jargon: what is wrong and what will happen
 *   why      what the model does with it (measured behaviour where there is some)
 *   steps    2-5 concrete steps, naming the file and what to look for
 *   verify   how to confirm it is fixed
 *   evidence {kind, ref}: how we know. kind is one of HDA.EVIDENCE_KINDS
 *   engine   (optional) what the engine itself did in the injected-fault benchmark: {name, said, pilot} or a list of them.
 *            Every engine line comes from results/pilot_table.md; "pilot" is the case number in that table.
 *
 * Findings are matched by their title (finding() in index.html calls HDA.adviceFor(title)); characterization messages
 * are matched by their text (HDA.charAdviceFor). tests/advice_fields.test.js checks that nothing the rules can say is left without advice.
 * Text in the fields is plain text; `back-ticks` mark file names and keywords and are shown as code. */
(function (root) {
  'use strict';
  var HDA = root.HDA = root.HDA || {};

  var EVIDENCE_KINDS = ['measured here', 'read in the engine source', 'documented', 'community-reported'];
  var MH = 'measured here', SRC = 'read in the engine source', DOC = 'documented', COM = 'community-reported';
  var NOT_REPRODUCED = 'not reproduced here';

  var LIST = [];     /* findings produced by the rules */
  var CHAR = [];     /* messages produced by the characterization */
  function F(id, family, sev, re, sample, o) { o.id = id; o.family = family; o.sev = sev; o.re = re; o.sample = sample; LIST.push(o); }
  /* A message that only reports what the tool saw in the upload (no engine behind it) is filed under community-reported, the weakest kind,
     and marked `inferred` so the page can say "inferred from your files" instead of suggesting a community source. */
  function C(id, kind, re, sample, o) {
    o.id = id; o.family = 'characterization'; o.kind = kind; o.re = re; o.sample = sample;
    if (o.evidence && /^Tool (inference|design)/.test(o.evidence.ref)) o.evidence.inferred = true;
    CHAR.push(o);
  }
  function ev(kind, ref) { return { kind: kind, ref: ref }; }
  function eng(name, said, pilot) { return { name: name, said: said, pilot: pilot }; }

  /* ═══════════════════ SWAT+ ═══════════════════ */
  F('swatplus.time_missing', 'SWAT+', 'warning', /^time\.sim not found$/, 'time.sim not found', {
    plain: 'The file that tells SWAT+ when the simulation starts and ends (`time.sim`) is not in the folder you dropped. Without a simulation period SWAT+ has nothing to run, so the run is expected to stop at once.',
    why: '`time.sim` holds the start and end dates of the run. The documentation says the run stops immediately without it. Not reproduced here: the benchmark emptied `time.sim` (pilot case #15) but did not delete it.',
    steps: [
      'Check that you dropped the TxtInOut folder itself (the one that contains `file.cio`), not a parent folder or a copy that lost files.',
      'If `time.sim` exists somewhere else on your disk, copy it into that same folder.',
      'If it is gone, write the input files again from the SWAT+ Editor; that writes the control files again, `time.sim` included.',
      'Do not make the file by hand unless you start from a working copy from the same project.'],
    verify: 'Drop the folder again: this warning should disappear. Then open `time.sim`: its last line should hold four numbers (start day, start year, end day, end year).',
    evidence: ev(DOC, 'Official SWAT+ documentation, as quoted in the rule; ' + NOT_REPRODUCED + '.')
  });
  F('swatplus.time_order', 'SWAT+', 'error', /^Simulation end date is before the start date$/, 'Simulation end date is before the start date', {
    plain: 'The end date in `time.sim` comes before the start date. SWAT+ cannot simulate a period that ends before it begins, so the run stops at the very start.',
    why: '`time.sim` gives SWAT+ four numbers: start day, start year, end day, end year. In the benchmark (end year 1999, start year 2020) SWAT+ crashed with "floating invalid" (error 65) and no message about `time.sim`, so the error number alone would not tell you where to look.',
    steps: [
      'Open `time.sim` in a text editor (use "Show me in the file" below to jump to the line).',
      'The last line holds four numbers: start day, start year, end day, end year (columns `day_start`, `yrc_start`, `day_end`, `yrc_end`).',
      'Correct them so the end comes after the start: the end year must not be smaller than the start year, and within the same year the end day must be larger.',
      'If you change the period in the SWAT+ Editor instead of in the file, write the input files again afterwards so `time.sim` is regenerated.'],
    verify: 'Drop the folder again: this error should disappear. Then run SWAT+; if it still stops with error 65, another file is involved, so look at the other findings.',
    evidence: ev(MH, 'pilot case #12 (results/pilot_table.md)'),
    engine: eng('SWAT+', 'crashed with "floating invalid" (error 65), with no message naming the cause.', 12)
  });
  F('swatplus.time_years', 'SWAT+', 'warning', /^Suspicious simulation years$/, 'Suspicious simulation years', {
    plain: 'The years the tool read from `time.sim` are outside 1900-2100. That usually means the numbers were read from the wrong columns, or the file is damaged.',
    why: 'The tool reads start and end year from the last line of `time.sim`. A year far outside the normal range most often means shifted columns or a typo. Based on the documentation; ' + NOT_REPRODUCED + '.',
    steps: [
      'Open `time.sim` and compare the column-names line with the values line below it.',
      'Check that each number sits under the right name (day, then year, for the start and for the end).',
      'Correct the file, or write the input files again from the SWAT+ Editor.'],
    verify: 'Drop the folder again: the warning should disappear and the years you expect should be the ones in the last line of `time.sim`.',
    evidence: ev(DOC, 'Rule text (official documentation); ' + NOT_REPRODUCED + '.')
  });
  F('swatplus.print_prt', 'SWAT+', 'warning', /^print\.prt not found$/, 'print.prt not found', {
    plain: '`print.prt`, the file that says which outputs SWAT+ writes, is not in the folder. The run may still start, but what gets written is undefined and you may not get the outputs you need.',
    why: 'From the documentation as quoted in the rule: without `print.prt` output control is undefined and some runs produce no usable outputs. ' + NOT_REPRODUCED + '.',
    steps: [
      'Check that `print.prt` is in the folder you dropped, next to `file.cio`.',
      'If it is in another folder, copy it next to `file.cio`.',
      'Otherwise write the input files again from the SWAT+ Editor.'],
    verify: 'Drop the folder again: the warning should disappear. After the next run, check that the output files you expect were written.',
    evidence: ev(DOC, 'Rule text (official documentation); ' + NOT_REPRODUCED + '.')
  });
  F('swatplus.soil_nulls', 'SWAT+', 'error', /^Null\/NaN fields inside soils\.sol$/, 'Null/NaN fields inside soils.sol', {
    plain: 'At least one number in `soils.sol` is written as `null` or `NaN` where a number belongs (the lines and columns are listed above). SWAT+ may not stop on this: it can finish and give you wrong water-balance results without any warning.',
    why: 'In the benchmark a null in the bulk density (`bd`) of one soil layer did not stop SWAT+: it finished with `success.fin`, 40 results changed, and the basin water balance moved by up to 4.5%. Community reports link nulls in soils to the "floating invalid" (error 65) crash; that part was ' + NOT_REPRODUCED + '. A `null` in the text column `texture` is normal and is not flagged.',
    steps: [
      'Click "Show me in the file", or open `soils.sol` and go to the line listed above.',
      'The text columns (`name`, `hyd_grp`, `texture`) may say `null`. Every number column (for example `bd`, `awc`, `soil_k`, `carbon`) must hold a real value.',
      'Fill the value from your source soil data. A guess will change your water balance.',
      'If you work in the SWAT+ Editor, fix the value in the soil table (or re-import it) and write the input files again so `soils.sol` is regenerated.'],
    verify: 'Drop the folder again: this error should disappear. After the next run, compare the basin water balance with your previous run; a change is expected because the null was hiding a missing value.',
    evidence: ev(MH, 'pilot case #14 (results/pilot_table.md)'),
    engine: eng('SWAT+', 'finished with `success.fin` and did not stop; 40 results changed (largest change 4.55%).', 14)
  });
  F('swatplus.soil_zero', 'SWAT+', 'warning', /^Zero or negative bulk density \/ layer depth in soils\.sol$/, 'Zero or negative bulk density / layer depth in soils.sol', {
    plain: 'A soil layer in `soils.sol` has a depth (`dp`) or a bulk density (`bd`) of zero or less. Both have to be positive numbers, otherwise the soil cannot be set up properly when the run starts.',
    why: 'The rule text and community reports say a zero thickness or density produces NaN during initialization. ' + NOT_REPRODUCED + ' (the benchmark case for soils used a null, not a zero).',
    steps: [
      'Open `soils.sol` and go to the lines listed above.',
      'Look at the columns `dp` and `bd` on those lines: both must be greater than zero.',
      'Replace them with the values from your source soil data, then write the input files again from the SWAT+ Editor if you made the change in its soil table.'],
    verify: 'Drop the folder again: the warning should disappear. Check that `dp` and `bd` are positive on every layer line.',
    evidence: ev(COM, 'SWAT+ user community, as quoted in the rule; ' + NOT_REPRODUCED + '.')
  });
  F('swatplus.gwflow_thickness', 'SWAT+', 'warning', /^gwflow: possible zero aquifer thickness cells$/, 'gwflow: possible zero aquifer thickness cells', {
    plain: 'A gwflow input file mentions thickness and contains many values of exactly 0.0. If those are aquifer thickness values, cells with no thickness can give invalid heads when the groundwater module starts.',
    why: 'This is a pattern guess: the tool counts the values 0.0 in a gwflow file that mentions thickness and warns above 10. It cannot tell whether those zeros really are thickness values. Community-reported; ' + NOT_REPRODUCED + '.',
    steps: [
      'Open the gwflow file named above and find the thickness values (use "Show me in the file").',
      'Check that every active cell has a thickness greater than zero. The rule suggests a minimum such as 5-10 m; that is its own example, not a measured value, so use what fits your aquifer.',
      'If the zeros are something else (inactive cells, other columns), you can ignore this warning.'],
    verify: 'Drop the folder again: the warning should disappear once fewer than about 10 zero values remain.',
    evidence: ev(COM, 'SWAT+ user community, as quoted in the rule; the zero count is a heuristic; ' + NOT_REPRODUCED + '.')
  });
  F('swatplus.gwflow_info', 'SWAT+', 'ok', /^gwflow module detected — extra care$/, 'gwflow module detected — extra care', {
    plain: 'This model uses the gwflow groundwater module. The tool found nothing wrong; this is a reminder that problems in this part are hard to find from the files alone.',
    why: 'The checks this tool has for gwflow are basic file checks. Community reports put gwflow problems at the exchange between surface water and groundwater. ' + NOT_REPRODUCED + '.',
    steps: [
      'If heads drift or the water balance leaks, first check the order of cells and landscape units (cell-LSU ordering) and the initial heads.',
      'Only after that change hydraulic conductivity or specific yield.',
      'If you are stuck, post the question with your SWAT+ revision and the gwflow files to the community.'],
    verify: 'Nothing to repair here. After a run, check the water balance of the groundwater output for leaks.',
    evidence: ev(COM, 'SWAT+ user community, as quoted in the rule; ' + NOT_REPRODUCED + '.')
  });
  F('swatplus.weather_refs', 'SWAT+', 'error', /^Weather files referenced but not found$/, 'Weather files referenced but not found', {
    plain: '`weather-sta.cli` names climate files (rainfall, temperature and so on) that are not in the folder. SWAT+ will not stop. It runs without that data, so you get results that look normal but are not.',
    why: 'In the benchmark, with one precipitation file deleted, SWAT+ finished with `success.fin` and 58 results changed, the largest by 876%. The only trace was a "file not found" line in `diagnostics.out`.',
    steps: [
      'Open `weather-sta.cli`: each station row names its climate files. The missing names are listed above.',
      'Copy the missing files into the same folder (TxtInOut), or correct the names in `weather-sta.cli` if they are typos or have a different extension.',
      'If you removed the files on purpose, the station row has to be changed to match; otherwise SWAT+ keeps looking for them.'],
    verify: 'Drop the folder again: this error should disappear. After the next run, search `diagnostics.out` for "file not found"; no climate file should be listed.',
    evidence: ev(MH, 'pilot case #13 (results/pilot_table.md)'),
    engine: eng('SWAT+', 'finished with `success.fin` and did not stop; 58 results changed (largest change 876%). The only trace is "file not found" in `diagnostics.out`.', 13)
  });
  F('swatplus.cli_sorted', 'SWAT+', 'error', /^Station lists are not sorted$/, 'Station lists are not sorted', {
    plain: 'The station lists (`pcp.cli`, `tmp.cli` and similar) are not in alphabetical order. SWAT+ looks stations up by name assuming sorted order, so with an unsorted list it silently ignores most stations and still ends with a success message.',
    why: 'In the benchmark, unsorting `pcp.cli` made SWAT+ finish with `success.fin` while 58 results changed, the largest by about 1,190%. On three real Pekin projects with unsorted lists, about 97% of the stations were ignored and the run still said "Execution successfully completed".',
    steps: [
      'If this card offers "Download fixed file", use it: it only reorders the station lines and leaves the two header lines alone.',
      'By hand: keep the two header lines, and sort the file names below them alphabetically in ASCII order (capital letters before lowercase). Do the same for every list named above.',
      'Save the corrected file in a copy of your model folder (replace the file of the same name), then drop that folder here again.'],
    verify: 'Drop the folder again: this error should disappear. After the next run, `diagnostics.out` should show no "file not found" lines for your stations.',
    evidence: ev(MH, 'pilot case #16 (results/pilot_table.md); three Pekin projects, rule comment'),
    engine: eng('SWAT+', 'finished with `success.fin` ("Execution successfully completed"); 58 results changed (largest change about 1,190%).', 16)
  });
  F('swatplus.table_rows', 'SWAT+', 'error', /^Rows with a different number of fields than the header$/, 'Rows with a different number of fields than the header', {
    plain: 'In a SWAT+ table file, at least one row has a different number of values than the column list in its header. SWAT+ reads each row by position, so values end up in the wrong columns and the run can finish with wrong numbers.',
    why: 'In the benchmark, removing the last value of every row in `hru-data.hru` did not stop SWAT+: it finished and 54 results changed, the largest by 200%. Rows like this did not appear in any of 137 working models for the 12 table files checked, so a working model is not expected to have them. Only `hru-data.hru` was run in the benchmark: it is reported as an error, the other tables as a warning.',
    steps: [
      'Open the file named above at the line given (line 2 is the header with the column names).',
      'Count the values in that row and the names in the header. They must be the same number.',
      'Compare with a working copy of the file, or with the rows above and below, to see which value is missing or extra.',
      'The safest repair is to write the file again from the SWAT+ Editor / QSWAT+ instead of patching it by hand.'],
    verify: 'Drop the folder again: this finding should disappear. Then check the number of values on the first and last rows against the header.',
    evidence: ev(MH, 'pilot case #17 (results/pilot_table.md); rule comment: 137 working models'),
    engine: eng('SWAT+', 'finished with `success.fin` and did not stop; 54 results changed (largest change 200%).', 17)
  });
  F('swatplus.diag_log', 'SWAT+', 'error', /^The last run reported missing input files$/, 'The last run reported missing input files', {
    plain: 'The `diagnostics.out` in this folder is left over from an earlier run, and in it SWAT+ itself said "file not found" for some input files. It carried on without them, so the results of that run are missing data.',
    why: 'SWAT+ writes "file not found" to `diagnostics.out` and still ends normally: pilot cases #13 and #16 both finished with `success.fin`. A finished run therefore does not prove that all inputs were read. The placeholders `sim` and `null` and the optional `basins_carbon.tes` are not counted.',
    steps: [
      'Open `diagnostics.out` and read the names of the files that were not found (listed above).',
      'For climate files (`.pcp`, `.tmp` and so on): look for a wrong name in `weather-sta.cli`, and check that `pcp.cli` / `tmp.cli` are sorted alphabetically.',
      'For other files: the name is wrong, or the file is in another folder. Copy it or correct the name.',
      'Run SWAT+ again so `diagnostics.out` is written anew.'],
    verify: 'After the new run, open the new `diagnostics.out`: no "file not found" lines should remain (the placeholders `sim`, `null` and `basins_carbon.tes` are normal).',
    evidence: ev(MH, 'pilot cases #13 and #16: SWAT+ logs "file not found" and still finishes'),
    engine: eng('SWAT+', 'wrote "file not found" lines to `diagnostics.out` and ended with `success.fin` (pilot cases #13 and #16).', 13)
  });

  /* ═══════════════════ SWAT2012 ═══════════════════ */
  F('swat2012.cio_missing', 'SWAT2012', 'error', /^file\.cio not found$/, 'file.cio not found', {
    plain: 'SWAT2012 starts from `file.cio`, the master control file, and it is not in the folder you dropped. Without it the model cannot run.',
    why: 'The documentation names `file.cio` as the master control file of SWAT2012. Not reproduced here (no benchmark case removed it).',
    steps: [
      'Check that you dropped the folder that holds the SWAT inputs (TxtInOut), not a parent folder.',
      'If `file.cio` is elsewhere on your disk, copy it into the folder with the other input files.',
      'If it is lost, write the inputs again from ArcSWAT / QSWAT.'],
    verify: 'Drop the folder again: this error should disappear and the tool should read the number of years from `file.cio`.',
    evidence: ev(DOC, 'Rule text (official documentation); ' + NOT_REPRODUCED + '.')
  });
  F('swat2012.nbyr', 'SWAT2012', 'error', /^NBYR \(years simulated\) looks invalid$/, 'NBYR (years simulated) looks invalid', {
    plain: '`file.cio` says the model should run for a number of years that is zero, negative or more than 150. That cannot be right.',
    why: '`NBYR` in `file.cio` is the number of years SWAT2012 simulates. The tool treats anything outside 1-150 as a mistake. Based on the documentation; ' + NOT_REPRODUCED + '.',
    steps: [
      'Open `file.cio` (use "Show me in the file") and find the line ending with `| NBYR`.',
      'Set it to the number of years you want to simulate, as a positive whole number.',
      'Check that `IYR` (first year) and the climate files cover those years.'],
    verify: 'Drop the folder again: this error should disappear.',
    evidence: ev(DOC, 'Rule text (official documentation); ' + NOT_REPRODUCED + '.')
  });
  F('swat2012.climate_cover', 'SWAT2012', 'warning', /^Climate file may not cover the simulation period$/, 'Climate file may not cover the simulation period', {
    plain: '`file.cio` asks for more years than a climate file contains (or starts in a year the file does not have). SWAT2012 may stop, or fill the gap with weather it makes up.',
    why: 'In the benchmark, `NBYR` = 60 against a climate record of about 33 years made SWAT2012 crash with an end-of-file error (exit code 24) and no message naming the cause. Whether a smaller gap stops the run or is filled by the weather generator was not tested.',
    steps: [
      'Open `file.cio`: note `NBYR` (years to simulate) and `IYR` (first year).',
      'Open the climate file named above: the first column of each data line holds the year. The tool lists the first and last year it found.',
      'Either lower `NBYR` or change `IYR` to fit the data, or extend the climate record.',
      'If you have several climate files, check each one (this tool looks at the first three `.pcp` files).'],
    verify: 'Drop the folder again: the warning should disappear. Run SWAT2012; it should no longer end with an end-of-file error.',
    evidence: ev(MH, 'pilot case #19 (results/pilot_table.md)'),
    engine: eng('SWAT2012', 'crashed with an end-of-file error (exit code 24), with no message naming the cause.', 19)
  });
  F('swat2012.sol_nulls', 'SWAT2012', 'error', /^Null values in soil \(\.sol\) files$/, 'Null values in soil (.sol) files', {
    plain: 'A soil file (`.sol`) has `null` or `NaN` where a number belongs. SWAT2012 can crash on this, or give a water balance that does not make sense.',
    why: 'In the benchmark, a null bulk density in one `.sol` file made SWAT2012 crash (exit code 64) with no message naming the cause. Null soil properties are also a known cause of implausible water-balance output (community-reported; ' + NOT_REPRODUCED + ').',
    steps: [
      'Open the `.sol` file named above (use "Show me in the file") and find the `null` or `NaN`.',
      'Find the soil it belongs to in your usersoil database and fill in the missing property from your source data.',
      'Re-create the `.sol` files from the repaired database, then drop the folder again.'],
    verify: 'Drop the folder again: this error should disappear. Search the `.sol` files for the words `null` and `nan`; none should remain.',
    evidence: ev(MH, 'pilot case #20 (results/pilot_table.md)'),
    engine: eng('SWAT2012', 'crashed (exit code 64), with no message naming the cause.', 20)
  });
  F('swat2012.referenced_files', 'SWAT2012', 'error', /^Input files named by the model are not in the folder$/, 'Input files named by the model are not in the folder', {
    plain: 'A subbasin, HRU or `fig.fig` file points to input files that are not in the folder (listed above, with the file that names them). SWAT2012 stops as soon as it cannot open one.',
    why: 'In the benchmark, deleting one `.sol` file that a `.sub`/`.hru` file names made SWAT2012 crash with an end-of-file error (exit code 24) and no message naming the missing file.',
    steps: [
      'Read the missing names above and the file that names them in brackets.',
      'Copy the missing files into the folder with the other inputs.',
      'If many files are missing, write the inputs again from the interface (ArcSWAT / QSWAT) instead of copying one by one.'],
    verify: 'Drop the folder again: this error should disappear. Run SWAT2012; it should get past reading the inputs.',
    evidence: ev(MH, 'pilot case #21 (results/pilot_table.md)'),
    engine: eng('SWAT2012', 'crashed with an end-of-file error (exit code 24), with no message naming the cause.', 21)
  });

  /* ═══════════════════ SWAT-MODFLOW ═══════════════════ */
  F('swatmf.mfn_missing', 'SWAT-MODFLOW', 'warning', /^modflow\.mfn not found$/, 'modflow.mfn not found', {
    plain: 'The MODFLOW name file (`.mfn`, usually `modflow.mfn`) was not found. The coupling cannot start without it.',
    why: 'The SWAT-MODFLOW user group advises that the name file must be where QSWATMOD points to. ' + NOT_REPRODUCED + ' (no benchmark case removed the `.mfn`).',
    steps: [
      'Look for a `.mfn` file in the MODFLOW folder of the project.',
      'Make sure it is in the folder QSWATMOD points to.',
      'Drop the whole project folder (SWAT and MODFLOW together) so the tool can see both.'],
    verify: 'Drop the folder again: this warning should disappear.',
    evidence: ev(COM, 'SWAT-MODFLOW user group, as quoted in the rule; ' + NOT_REPRODUCED + '.')
  });
  F('swatmf.low_units', 'SWAT-MODFLOW', 'warning', /^Low file-unit numbers in /, 'Low file-unit numbers in modflow.mfn', {
    plain: '`modflow.mfn` gives some MODFLOW files unit numbers below 5000. Low numbers can collide with files SWAT keeps open, and then the coupled run can stop before it finishes. It is a risk, not a certainty.',
    why: 'Measured on the Middle Bosque model: of 9 values below 5000, 3 stopped the run (10, 11 and 50) and 6 ran fine; every value of 5000 or more ran. In the benchmark the stopped run did not complete although its exit code was 0, so a script that only checks the exit code would think it worked.',
    steps: [
      'If this card offers "Download fixed file", it renumbers low units by adding 5000 and leaves package and file names unchanged. It declines when another file repeats a unit number.',
      'By hand: in `modflow.mfn`, change the number in the second column to 5000 or more, keeping every unit number different.',
      'Other files may repeat a unit (for example `HEAD SAVE UNIT n` in the OC file, or the budget flag in RIV / RCH / UPW). Change those to the same new number.',
      'Put the corrected file in a copy of your model folder and drop it again.'],
    verify: 'Drop the folder again: this warning should disappear. Then run SWAT-MODFLOW and check that it reaches the end of the simulation period.',
    evidence: ev(MH, 'pilot case #7 (results/pilot_table.md); Middle Bosque sweep'),
    engine: eng('SWAT-MODFLOW', 'stopped before finishing (the run did not complete, yet the exit code was 0).', 7)
  });
  F('swatmf.period_align', 'SWAT-MODFLOW', 'error', /^MODFLOW time is shorter than the SWAT period$/, 'MODFLOW time is shorter than the SWAT period', {
    plain: 'The MODFLOW stress periods in the DIS file add up to fewer days than SWAT simulates. SWAT-MODFLOW moves MODFLOW forward one day at a time, so when the periods run out the coupled run crashes.',
    why: 'In the benchmark, a MODFLOW time shorter than the SWAT period made SWAT-MODFLOW crash with an end-of-file error (exit code 24) and no message naming the cause.',
    steps: [
      'Open the DIS file named above and find the stress-period lines (`PERLEN NSTP TSMULT Ss/tr`).',
      'Add up `PERLEN` over all periods, in days. The time unit is the fifth number of the header line (`ITMUNI`: 1 seconds, 2 minutes, 3 hours, 4 days, 5 years).',
      'Make the total at least as long as the SWAT period (`NBYR` in `file.cio`). Community practice is the SWAT period plus about 100 days.',
      'Or use "Download fixed file" if it is offered: it lengthens the last stress period to SWAT period + 100 days.'],
    verify: 'Drop the folder again: this error should disappear. Then run SWAT-MODFLOW and check that it reaches the end of the SWAT period.',
    evidence: ev(MH, 'pilot case #8 (results/pilot_table.md)'),
    engine: eng('SWAT-MODFLOW', 'crashed with an end-of-file error (exit code 24), with no message naming the cause.', 8)
  });
  F('modflow.name_file_refs', 'SWAT-MODFLOW / MODFLOW', 'error', /^Name file references files that are not in the folder$/, 'Name file references files that are not in the folder', {
    plain: 'The MODFLOW name file lists package files that are not in the folder (listed above). MODFLOW stops as soon as it cannot open one.',
    why: 'In the benchmark, deleting `mf_1000.upw` (named in `modflow.mfn`) made SWAT-MODFLOW stop with "ERROR OPENING FILE mf_1000.upw". The same name-file check is used for plain MODFLOW; the benchmark ran it only inside SWAT-MODFLOW. Files MODFLOW writes itself (LIST, DATA, output files) are not counted.',
    steps: [
      'Read the missing file names above and the name file they come from.',
      'Copy the files next to the name file, or correct the paths in the name file. Avoid long paths and spaces.',
      'Drop the whole model folder so the tool can see all files.'],
    verify: 'Drop the folder again: this error should disappear. Then run MODFLOW; it should get past opening the package files.',
    evidence: ev(MH, 'pilot case #10 (results/pilot_table.md); shared with plain MODFLOW'),
    engine: eng('SWAT-MODFLOW', 'stopped with "ERROR OPENING FILE mf_1000.upw", so here the engine does name the file.', 10)
  });
  F('swatmf.link_missing', 'SWAT-MODFLOW', 'error', /^swatmf_link\.txt not found$/, 'swatmf_link.txt not found', {
    plain: '`swatmf_link.txt`, the file that links SWAT to MODFLOW, is not in the folder. SWAT-MODFLOW reads it at start-up and crashes without it.',
    why: 'In the benchmark, deleting `swatmf_link.txt` from a working model made SWAT-MODFLOW crash with an end-of-file error (exit code 24) and no message naming the file.',
    steps: [
      'Look for a copy of `swatmf_link.txt` in your project (an earlier copy or a backup) and put it back in the folder with the other model inputs.',
      'If it is lost, run the linking step in QSWATMOD again to regenerate it.',
      'Drop the whole project (SWAT and MODFLOW folders) again.'],
    verify: 'Drop the folder again: this error should disappear. Then run SWAT-MODFLOW; it should get past start-up.',
    evidence: ev(MH, 'pilot case #9 (results/pilot_table.md)'),
    engine: eng('SWAT-MODFLOW', 'crashed with an end-of-file error (exit code 24), with no message naming the cause.', 9)
  });

  /* ═══════════════════ MODFLOW (2005 / NWT / USG) ═══════════════════ */
  F('modflow.solver_failed', 'MODFLOW', 'error', /^Solver failed to converge$/, 'Solver failed to converge', {
    plain: 'The MODFLOW listing file says the solver could not find a solution. The heads from the time steps that failed should not be trusted.',
    why: 'The detection reads MODFLOW\'s own message in the listing. The causes named below (large contrasts in hydraulic conductivity, cells drying out, too tight a closure criterion) are general MODFLOW practice reported by the community; they were ' + NOT_REPRODUCED + '.',
    steps: [
      'Open the listing file named above (use "Show me in the file") and find the first time step where it failed.',
      'Look for neighbouring cells whose hydraulic conductivity differs by orders of magnitude, and smooth the transition.',
      'Check the starting heads and the dry cells reported in the same listing.',
      'Try MODFLOW-NWT, or MODFLOW 6 with the IMS MODERATE or COMPLEX preset. If it still fails, post a well-formed question with the listing to the community.'],
    verify: 'Run MODFLOW again and search the new listing for the words "FAILED TO MEET SOLVER CONVERGENCE" or "FAILED TO CONVERGE"; none should appear. Then drop the folder again.',
    evidence: ev(COM, 'MODFLOW users community, as quoted in the rule; the detection is MODFLOW\'s own message, the suggested causes are ' + NOT_REPRODUCED + '.')
  });
  F('modflow.discrepancy', 'MODFLOW', 'warning', /^Water-budget discrepancy above 1%$/, 'Water-budget discrepancy above 1%', {
    plain: 'The water budget in the MODFLOW listing does not balance: the worst percent discrepancy is above 1%. That means the solution does not conserve water well enough to trust the results.',
    why: 'The 1% limit is a rule of thumb from the MODFLOW community, not a measured threshold. The number itself is read from the listing. ' + NOT_REPRODUCED + '.',
    steps: [
      'Open the listing file and search for `PERCENT DISCREPANCY` to see which time steps are worst.',
      'Check boundary-condition conductances and dry cells around those steps.',
      'Tighten the solver closure gradually, then check the budget again.'],
    verify: 'Run MODFLOW again: every `PERCENT DISCREPANCY` in the new listing should be below about 1%.',
    evidence: ev(COM, 'MODFLOW users community rule of thumb, as quoted in the rule; ' + NOT_REPRODUCED + '.')
  });
  F('modflow.dry_cells', 'MODFLOW', 'warning', /^Dry cells detected during the run$/, 'Dry cells detected during the run', {
    plain: 'The listing says cells went dry during the run. Cells that dry out and wet again can make the solver swing back and forth and fail to converge, especially in water-table aquifers.',
    why: 'The detection reads the listing text (CELL GOES DRY / CONVERTED TO DRY). The advice about MODFLOW-NWT and the MODFLOW 6 Newton formulation is community practice, ' + NOT_REPRODUCED + '.',
    steps: [
      'Open the listing file and look at which cells and time steps went dry.',
      'Check whether those cells are near a pumping well or a boundary that removes more water than the cell holds.',
      'Consider MODFLOW-NWT (upstream weighting) or the MODFLOW 6 Newton formulation, which are designed for drying cells.'],
    verify: 'Run again and search the new listing for `CELL GOES DRY`; fewer or no dry cells, and no convergence failure, is the goal.',
    evidence: ev(COM, 'MODFLOW users community, as quoted in the rule; ' + NOT_REPRODUCED + '.')
  });
  F('modflow.chd_fraction', 'MODFLOW', 'warning', /^Very large fraction of constant-head \(CHD\) cells$/, 'Very large fraction of constant-head (CHD) cells', {
    plain: 'More than half of the model cells are held at a fixed head (CHD). The solution is then forced by those values, and the computed heads often just repeat the starting heads.',
    why: 'The tool compares the number of CHD entries with the number of cells (NLAY x NROW x NCOL from the DIS file). The 50% limit is a heuristic from community practice; ' + NOT_REPRODUCED + '.',
    steps: [
      'Open the `.chd` file named above and check where the fixed-head cells are.',
      'Keep fixed heads only on true boundaries (a lake, a river stage, a model edge).',
      'Let the interior cells be solved.'],
    verify: 'Drop the folder again: the warning should disappear once fixed-head cells are below half of the cells.',
    evidence: ev(COM, 'MODFLOW users community, as quoted in the rule; the 50% limit is a heuristic; ' + NOT_REPRODUCED + '.')
  });

  /* ═══════════════════ all frameworks ═══════════════════ */
  F('generic.empty_files', 'all', 'error', /^Empty \(0-byte\) files that the model reads$/, 'Empty (0-byte) files that the model reads', {
    plain: 'Some files that the model reads at start-up are completely empty (0 bytes). That usually happens when saving was interrupted, and the model then crashes when it reads them.',
    why: 'In the benchmark, an empty `time.sim` made SWAT+ crash with "floating divide by zero" (error 73) and an empty `.sol` file made SWAT2012 crash with an end-of-file error, both without naming the file. These two are reported as errors; other empty input files are reported as a warning, not measured. Empty files nobody names (such as `hru.dat`) are normal and are not reported.',
    steps: [
      'Look at the file names above. Each one is named as an input by a control file but has no content.',
      'Restore the file from a backup or an earlier copy of the project.',
      'Or write the input files again from the interface (SWAT+ Editor, ArcSWAT / QSWAT).'],
    verify: 'Drop the folder again: this finding should disappear. Check that the restored file is larger than 0 bytes.',
    evidence: ev(MH, 'pilot cases #15 and #22 (results/pilot_table.md)'),
    engine: [eng('SWAT+', 'with an empty `time.sim`, crashed with "floating divide by zero" (error 73), with no message naming the cause.', 15),
             eng('SWAT2012', 'with an empty `.sol` file, crashed with an end-of-file error (exit code 24), with no message naming the cause.', 22)]
  });
  F('generic.path_names', 'all', 'warning', /^Problematic characters in file\/folder names$/, 'Problematic characters in file/folder names', {
    plain: 'Some file or folder names contain accented letters, double spaces, commas or semicolons. These models are Fortran programs, and they may fail to open files whose names contain such characters on Windows.',
    why: 'The rule text says accented characters and unusual symbols break Fortran file handling on Windows. ' + NOT_REPRODUCED + '.',
    steps: [
      'Look at the names above.',
      'Move the model to a short folder without accents or spaces, for example `C:\\models\\myproj`.',
      'Rename files only if no other file refers to them by name; otherwise change the reference too.'],
    verify: 'Drop the folder again from the new location: this warning should disappear.',
    evidence: ev(DOC, 'Rule text (documentation of Fortran file handling on Windows); ' + NOT_REPRODUCED + '.')
  });

  /* ═══════════════════ MODFLOW 6 ═══════════════════ */
  F('mf6.name_file_refs', 'MODFLOW 6', 'error', /^MODFLOW 6 name files reference files that are not in the folder$/, 'MODFLOW 6 name files reference files that are not in the folder', {
    plain: '`mfsim.nam` or a model name file lists package files that are not in the folder (listed above). MODFLOW 6 stops with an error report as soon as it cannot open one.',
    why: 'In the benchmark, deleting `gwf.npf` made MODFLOW 6 stop because it could not open the file.',
    steps: [
      'Read the missing names above and the name file that lists them.',
      'Restore the files from a backup or from the script that built the model (for example FloPy).',
      'Or correct the names in the name file if they are only misspelled.'],
    verify: 'Drop the folder again: this error should disappear. Then run `mf6`; it should get past reading the packages.',
    evidence: ev(MH, 'pilot case #5 (results/pilot_table.md)'),
    engine: eng('MODFLOW 6', 'stopped: could not open `gwf.npf`; here the engine does name the file.', 5)
  });
  F('mf6.nper', 'MODFLOW 6', 'error', /^NPER does not match the stress periods defined$/, 'NPER does not match the stress periods defined', {
    plain: 'The time-discretization file says one number of stress periods (`NPER`) but defines a different number of period lines. MODFLOW 6 stops when they disagree.',
    why: 'In the benchmark, `NPER` = 6 with 5 periods defined made MODFLOW 6 stop with a size mismatch error for `PERLEN`. The message names `PERLEN`, not `NPER`.',
    steps: [
      'Open the `.tdis` file named above (use "Show me in the file").',
      'Count the lines between `BEGIN perioddata` and `END perioddata`.',
      'Make `NPER` in the `dimensions` block equal to that number, or add the missing period line.'],
    verify: 'Drop the folder again: this error should disappear. Then run `mf6`.',
    evidence: ev(MH, 'pilot case #4 (results/pilot_table.md)'),
    engine: eng('MODFLOW 6', 'stopped with a size mismatch error for `PERLEN`; the message does not name `NPER`.', 4)
  });
  F('mf6.listing_convergence', 'MODFLOW 6', 'error', /^MODFLOW 6 solver did not converge$/, 'MODFLOW 6 solver did not converge', {
    plain: 'The MODFLOW 6 listing records a convergence failure: the solver could not find a solution for one or more time steps. Heads from those steps are not converged answers, even if the run ended with "Normal termination".',
    why: 'Checked with MODFLOW 6.7.0: a failed step prints "Solution 1 did not converge for stress period ... and time step ..." and the report counts the failures. With the CONTINUE option the run still ends with "Normal termination of simulation", so a success message in the listing does not prove the results are converged.',
    steps: [
      'Open the listing (`mfsim.lst`) and find the first failed time step; the tool tells you its stress period and step.',
      'In the IMS file raise `OUTER_MAXIMUM` and `INNER_MAXIMUM`. Loosen `OUTER_DVCLOSE` / `INNER_RCLOSE` only if you can justify the larger error.',
      'Look for the cause in the model: dry cells, a boundary (CHD, WEL, RIV, DRN) that adds or removes more water than the cell holds, or a very large time step.',
      'For unconfined problems consider the Newton formulation (`NEWTON` in the model name file).'],
    verify: 'Run `mf6` again: the new `mfsim.lst` should contain no "did not converge" lines and no "Simulation convergence failure".',
    evidence: ev(MH, 'MODFLOW 6.7.0 test runs (the rule agreed with the real listings tried); related pilot case #6')
  });
  F('mf6.outer_maximum', 'MODFLOW 6', 'warning', /^IMS allows only 1 outer iteration \(OUTER_MAXIMUM 1\)$/, 'IMS allows only 1 outer iteration (OUTER_MAXIMUM 1)', {
    plain: 'The solver file allows only one outer iteration per time step. In every flow model tried, MODFLOW 6 stopped with a convergence failure with this setting, so your run will almost certainly fail too.',
    why: 'In MODFLOW 6.7.0 test runs, `OUTER_MAXIMUM 1` stopped three different flow models (confined, unconfined, unconfined with recharge and transport), while 2 or more converged. The only model that converged with 1 did not change at all (starting heads equal to the answer, no stresses). It is a warning, not an error, because of that one exception.',
    steps: [
      'Open the IMS file named above (use "Show me in the file").',
      'Remove the `OUTER_MAXIMUM` line, or set it to a normal value (the MODERATE preset uses 50).',
      'Keep a note of why it was 1, in case it was set on purpose for a test.'],
    verify: 'Drop the folder again: this warning should disappear. Then run `mf6`; the listing should not report a convergence failure.',
    evidence: ev(MH, 'pilot case #6 (results/pilot_table.md)'),
    engine: eng('MODFLOW 6', 'stopped with a simulation convergence failure.', 6)
  });
  F('mf6.outer_dvclose', 'MODFLOW 6', 'warning', /^IMS head-change closure is tighter than double precision allows/, 'IMS head-change closure is tighter than double precision allows (OUTER_DVCLOSE 1e-15)', {
    plain: 'The head-change closure in the solver file is so small that the computer\'s rounding error is larger than it. The solver can never meet it, so MODFLOW 6 reports a convergence failure.',
    why: 'In MODFLOW 6.7.0 test runs, an `OUTER_DVCLOSE` of 1e-15 or smaller made every flow model fail with "Simulation convergence failure"; 1e-10 converged in all of them. The only model that converged did not change at all.',
    steps: [
      'Open the IMS file named above and find `OUTER_DVCLOSE` (older name `OUTER_HCLOSE`).',
      'Set a looser value. The MODERATE preset uses 0.01; the tests converged down to 1e-10.',
      'After the run, check the water-budget error in the listing to see that the looser value is good enough for your problem.'],
    verify: 'Drop the folder again: this warning should disappear. Run `mf6` and check the listing for "convergence failure".',
    evidence: ev(MH, 'MODFLOW 6.7.0 test runs on three models; related pilot case #6 (same failure, other setting)')
  });
  F('mf6.inner_rclose', 'MODFLOW 6', 'warning', /^IMS residual closure is tighter than double precision allows/, 'IMS residual closure is tighter than double precision allows (INNER_RCLOSE 1e-18)', {
    plain: 'The residual closure in the solver file is so small that rounding error is larger than it. The solver cannot meet it, and MODFLOW 6 reports a convergence failure.',
    why: 'In MODFLOW 6.7.0 test runs, an `INNER_RCLOSE` of 1e-16 or smaller made every flow model fail with "Simulation convergence failure", also when the hydraulic conductivity was changed from 0.0005 to 5000. The only model that converged did not change at all.',
    steps: [
      'Open the IMS file named above and find `INNER_RCLOSE`.',
      'Use a value that fits your flows. The MODERATE preset uses 0.1.',
      'Tighten it only if the budget error in the listing needs it.'],
    verify: 'Drop the folder again: this warning should disappear. Run `mf6` and check the listing for "convergence failure".',
    evidence: ev(MH, 'MODFLOW 6.7.0 test runs on three models; related pilot case #6 (same failure, other setting)')
  });

  /* ═══════════════════ APEX ═══════════════════ */
  F('apex.empty_control', 'APEX', 'error', /^Empty APEX control files$/, 'Empty APEX control files', {
    plain: 'An APEX control file (`APEXCONT.DAT`, `APEXRUN.DAT` or `APEXFILE.DAT`) is empty. APEX reads these at start-up and stops with an end-of-file error.',
    why: 'In the benchmark, emptying `APEXCONT.DAT` made APEX stop with an end-of-file error while reading it. Here the engine does name the file, but the tool tells you before you spend a run on it.',
    steps: [
      'Look at the file names above.',
      'Restore the file from a backup or an earlier copy of the project.',
      'Or regenerate it with the APEX editor.'],
    verify: 'Drop the folder again: this error should disappear. Check that the restored file is larger than 0 bytes.',
    evidence: ev(MH, 'pilot case #2 (results/pilot_table.md)'),
    engine: eng('APEX', 'crashed with an end-of-file error while reading `APEXCONT.DAT`.', 2)
  });
  F('apex.link_missing', 'APEX', 'error', /^apexmf_link\.txt not found$/, 'apexmf_link.txt not found', {
    plain: 'This folder has `apexmf.con`, so it is an APEX-MODFLOW model, but `apexmf_link.txt` is missing. APEX-MODFLOW reads that file at start-up and crashes without it.',
    why: 'In the benchmark, deleting `apexmf_link.txt` from a working model made APEX-MODFLOW stop with an end-of-file error while reading it. The file normally sits in the MODFLOW folder.',
    steps: [
      'Look for `apexmf_link.txt` in the MODFLOW sub-folder of your APEX-MODFLOW project and copy it to where the tool expects it.',
      'If it is lost, regenerate it with the APEX-MODFLOW setup.',
      'Drop the whole project folder again.'],
    verify: 'Drop the folder again: this error should disappear. Then run APEX-MODFLOW; it should get past start-up.',
    evidence: ev(MH, 'pilot case #3 (results/pilot_table.md)'),
    engine: eng('APEX-MODFLOW', 'crashed with an end-of-file error while reading `apexmf_link.txt`.', 3)
  });

  /* ═══════════════════ characterization: what the tool saw in the upload ═══════════════════
     These come from the way the files sit together, not from one rule. "pushes" is how many messages in characterize.js each entry covers
     (tests/advice_fields.test.js counts the messages in the source so a new one cannot be added without advice). */
  C('char.mf6swatp_gwflow', 'problems', /^MF6SWATP is switched on but gwflow is also on/, 'MF6SWATP is switched on but gwflow is also on: SWAT+ will stop', {
    plain: 'You have both MF6SWATP (SWAT+ coupled to MODFLOW 6) and gwflow (the built-in SWAT+ groundwater) switched on. They are alternatives: with both, SWAT+ ends the run with a fatal message.',
    why: 'The MF6SWATP hook checks at start-up whether gwflow is active and refuses to run if it is, because MODFLOW 6 replaces the aquifers. Read from the source of the hook (`mf6swatp_module.f90`, `mf6swatp_check_enabled`).',
    steps: [
      'Decide which groundwater model you want: MODFLOW 6 through MF6SWATP, or gwflow.',
      'For MF6SWATP: open `codes.bsn` and set `gwflow` to 0.',
      'For gwflow: remove (or rename) `mf6swatp.cfg` from the SWAT+ folder.'],
    verify: 'Drop the folder again: this red box should disappear.',
    evidence: ev(SRC, 'mf6swatp_module.f90 (mf6swatp_check_enabled), as cited by the tool')
  });
  C('char.mf6swatp_no_mf6', 'missing', /^MF6SWATP needs a MODFLOW 6 model next to the SWAT\+ run/, 'MF6SWATP needs a MODFLOW 6 model next to the SWAT+ run. None was found in this upload.', {
    plain: 'The files show an MF6SWATP setup for SWAT+, but no MODFLOW 6 model came with the upload. The tool can only check the SWAT+ side.',
    why: 'With MF6SWATP, MODFLOW 6 replaces the SWAT+ aquifers (per the hook\'s source), so it needs a MODFLOW 6 model. The tool only noticed that none was in what you dropped.',
    steps: [
      'Find the MODFLOW 6 folder (the one with `mfsim.nam`) that goes with this SWAT+ project.',
      'Drop the parent folder that holds both, or add the MODFLOW 6 folder to the selection.'],
    verify: 'Drop both again: this message should disappear and the MODFLOW 6 model should be listed under "Groundwater model".',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.mf6swatp_cfg_missing', 'notes', /^MF6SWATP export files were found, but mf6swatp\.cfg was not/, 'MF6SWATP export files were found, but mf6swatp.cfg was not. The hook only runs when that file is in the SWAT+ working folder.', {
    plain: 'Files that look like MF6SWATP exports are here, but `mf6swatp.cfg` is not in the SWAT+ folder. The coupling hook only runs when that file is there, so SWAT+ would run on its own.',
    why: 'The hook only runs when `mf6swatp.cfg` is in the SWAT+ working folder (the tool\'s own note says so), so without it SWAT+ would not be coupled. Based on the tool\'s reading of the files; ' + NOT_REPRODUCED + '.',
    steps: [
      'If you intend to use MF6SWATP, copy `mf6swatp.cfg` into the SWAT+ working folder (next to `file.cio`).',
      'If these files are leftovers from an earlier setup, no action is needed.'],
    verify: 'Drop the folder again: the note should disappear once `mf6swatp.cfg` is in the SWAT+ folder.',
    evidence: ev(COM, 'Tool inference from the files in the upload; ' + NOT_REPRODUCED + '.')
  });
  C('char.swatplus_mf6_unknown_coupling', 'notes', /^The files show SWAT\+ and MODFLOW 6 side by side/, 'The files show SWAT+ and MODFLOW 6 side by side. They do not show HOW they are coupled (offline, one-way recharge hand-off, or API-driven). Say which, or add the scripts that connect them.', {
    plain: 'A SWAT+ model and a MODFLOW 6 model are in the upload, but nothing in the files says how they exchange water. The tool therefore checks each model on its own and cannot check the exchange.',
    why: 'There is more than one way to couple the two (run one after the other, hand recharge over once, or exchange every step through scripts). The files alone do not distinguish them, so the tool does not guess.',
    steps: [
      'Add the scripts or configuration that connect the two models (for example the Python script that calls the MODFLOW 6 API).',
      'Or just keep going: the model-by-model checks below are still valid for each part.'],
    verify: 'Drop the folder again with the coupling scripts included: the tool may then recognise how they are connected.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.mf6_api_script', 'notes', /^An MODFLOW 6 API script was found/, 'An MODFLOW 6 API script was found, which suggests an API-driven coupling.', {
    plain: 'A script that uses the MODFLOW 6 API was found, which suggests the two models exchange water step by step through that script. The tool reads this as a hint only.',
    why: 'A Python script that imports the MODFLOW 6 API normally drives MODFLOW 6 from outside. This is a hint from file contents: the tool only looks for signs of the API and does not run the script.',
    steps: [
      'If this is right, nothing needs to be done.',
      'If the script is unrelated (an old test, for example), you can ignore this note.'],
    verify: 'Nothing to fix; this note is informational.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.gwflow_and_mf6', 'ambiguity', /^gwflow input files are present AND a MODFLOW 6 model is present/, 'gwflow input files are present AND a MODFLOW 6 model is present. Only one of them is normally the active groundwater model.', {
    plain: 'The upload has input files for both gwflow (the SWAT+ built-in groundwater) and a separate MODFLOW 6 model. Normally only one of them is the groundwater model that is used, and the tool cannot tell which.',
    why: 'Running both would count the same aquifer twice. The files show which exist, not which you meant to use.',
    steps: [
      'Decide which one is your groundwater model.',
      'Check `codes.bsn` (`gwflow` 1 = on, 0 = off) and whether `file.cio` connects `gwflow.con`.',
      'Remove or rename the files of the unused one so the folder says what you mean.'],
    verify: 'Drop the folder again: the question should disappear once only one groundwater model remains.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.smrt_missing', 'missing', /^SWAT\+MODFLOW normally needs its smrt\.\* linkage files/, 'SWAT+MODFLOW normally needs its smrt.* linkage files next to the model. None were found.', {
    plain: 'A legacy MODFLOW model sits next to a SWAT+ model, but the `smrt.*` linkage files that couple them were not found. Without them the tool treats the two as separate models.',
    why: 'The SWAT+MODFLOW linkage is carried by files whose names start with `smrt.`. If they are absent, the tool cannot confirm a coupling and lowers its confidence. Based on the tool\'s reading of the files; ' + NOT_REPRODUCED + '.',
    steps: [
      'Look in the SWAT+ folder for files named `smrt.*` (for example `smrt.hrucells`).',
      'Add them to the upload and drop again.',
      'If the two models are not meant to be coupled, nothing needs to be done.'],
    verify: 'Drop the folder again with the `smrt.*` files: the model label should change to the SWAT+MODFLOW coupling.',
    evidence: ev(COM, 'Tool inference from the files in the upload; ' + NOT_REPRODUCED + '.')
  });
  C('char.gwflow_and_legacy_mf', 'ambiguity', /^gwflow input files are present alongside a legacy MODFLOW model/, 'gwflow input files are present alongside a legacy MODFLOW model.', {
    plain: 'The upload has input files for gwflow and for a legacy (MODFLOW-2005/NWT/USG) model next to SWAT+. Normally only one of them is the groundwater model in use.',
    why: 'Same reason as with MODFLOW 6: running both counts one aquifer twice. The files show which exist, not which you meant to use.',
    steps: [
      'Decide which groundwater model you are using.',
      'Check `codes.bsn` (`gwflow` 1 = on, 0 = off).',
      'Remove or rename the files of the one you do not use.'],
    verify: 'Drop the folder again: the question should disappear once only one groundwater model remains.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.gwflow_unreadable', 'notes', /^Neither codes\.bsn nor file\.cio could be read/, 'Neither codes.bsn nor file.cio could be read, so it could not be confirmed that gwflow is switched on.', {
    unreachable: true,   /* the message is in characterize.js but its condition cannot be met with the current detection (gwflow counts as active only when codes.bsn or file.cio says so); kept so the text is ready if that changes */
    plain: 'The tool could not read `codes.bsn` or `file.cio`, so it could not confirm that gwflow is switched on. It guessed from the gwflow files that are present.',
    why: 'Whether gwflow is on is set in `codes.bsn` and in the `file.cio` connection to `gwflow.con`. Without either, the tool has only the presence of the gwflow files to go by.',
    steps: [
      'Check that `codes.bsn` and `file.cio` are in the folder you dropped.',
      'If they are, open them to see whether they are empty or damaged.'],
    verify: 'Drop the folder again: the label should show "switched on in codes.bsn" under "Groundwater module".',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.gwflow_off', 'ambiguity', /^gwflow input files exist but the module is switched off/, 'gwflow input files exist but the module is switched off (codes.bsn has gwflow = 0).', {
    plain: 'gwflow input files are in the folder, but the module is switched off, so SWAT+ will not use them. If you wanted gwflow, it will not be in your results.',
    why: 'The switch is `gwflow` in `codes.bsn` and the `gwflow.con` connection in `file.cio`. Files that are present but not switched on are expected to be ignored by the run. Based on the tool\'s reading of the files; ' + NOT_REPRODUCED + '.',
    steps: [
      'Decide whether you want gwflow in this run.',
      'If yes: set `gwflow` to 1 in `codes.bsn` and make sure `file.cio` connects `gwflow.con`.',
      'If no: the files can stay, nothing needs to be done.'],
    verify: 'Drop the folder again: the label under "Groundwater module" should say "switched on" if you turned it on.',
    evidence: ev(COM, 'Tool inference from the files in the upload; ' + NOT_REPRODUCED + '.')
  });
  C('char.gwflow_disagree', 'ambiguity', /^codes\.bsn says gwflow = \d but file\.cio/, 'codes.bsn says gwflow = 1 but file.cio does not connect gwflow.con. The two disagree.', {
    plain: '`codes.bsn` and `file.cio` give different answers about whether gwflow is on. The tool cannot tell which one you meant, so look at it before you run.',
    why: 'In the benchmark, `gwflow = 1` in `codes.bsn` with `file.cio` not connecting `gwflow.con` did not change anything: SWAT+ finished normally and the results were identical to the working model. So here it is a heads-up about an unclear setup, not a measured problem.',
    steps: [
      'Open `codes.bsn` and look at the `gwflow` value (1 = on, 0 = off).',
      'Open `file.cio` and check whether it connects `gwflow.con`.',
      'Make the two agree with what you want, ideally by writing the input files again from the SWAT+ Editor.'],
    verify: 'Drop the folder again: this question should disappear once both files agree.',
    evidence: ev(MH, 'pilot case #11 (results/pilot_table.md)'),
    engine: eng('SWAT+', 'finished normally; the results were identical to the working model.', 11)
  });
  C('char.gwflow_input_missing', 'missing', /^codes\.bsn switches gwflow on, but gwflow\.input was not found/, 'codes.bsn switches gwflow on, but gwflow.input was not found.', {
    plain: '`codes.bsn` turns gwflow on, but `gwflow.input`, the file that describes it, is not in the folder. With gwflow on and no input the run cannot set up the groundwater properly.',
    why: 'The `gwflow` switch in `codes.bsn` tells SWAT+ to read the gwflow files, and the tool expects `gwflow.input` whenever gwflow is switched on. ' + NOT_REPRODUCED + ' (no benchmark case deleted it).',
    steps: [
      'Look for `gwflow.input` in your project (it is written together with the other gwflow files).',
      'Copy it next to `codes.bsn`, or write the input files again from the SWAT+ Editor.',
      'If you do not want gwflow, set `gwflow` to 0 in `codes.bsn`.'],
    verify: 'Drop the folder again: this message should disappear.',
    evidence: ev(COM, 'Tool inference from the files in the upload; ' + NOT_REPRODUCED + '.')
  });
  C('char.codes_layout', 'notes', /^codes\.bsn has the rev-\d+ column layout/, 'codes.bsn has the rev-62 column layout (26 columns), but most files here are rev 61.0.2. In rev 62 the column i_fpwet became qual2e and idc_till was added, so an executable of the other revision reads this file shifted by one column. Make sure the executable matches the codes.bsn revision.', {
    plain: '`codes.bsn` was written for a different SWAT+ revision than most other files in the folder. If the SWAT+ program you run is the other revision, it reads this file one column off.',
    why: 'In the benchmark, a rev-62 `codes.bsn` read by a rev-61 SWAT+ engine did not change anything: the run finished normally and the results were identical. So this is a heads-up that the setup is mixed, not a measured problem. The difference between the layouts (the column `i_fpwet` became `qual2e` and `idc_till` was added) is from the rule.',
    steps: [
      'Look at the first line of `codes.bsn` and the other files; they say which SWAT+ revision wrote them.',
      'Check which SWAT+ executable you run (the tool lists executables found in the folder).',
      'Use an executable of the same revision as your files, or write the input files again with the revision you use.'],
    verify: 'Drop the folder again after writing the files again: the note should disappear when the revisions match.',
    evidence: ev(MH, 'pilot case #18 (results/pilot_table.md)'),
    engine: eng('SWAT+', 'finished normally; the results were identical to the working model (this mismatch did no harm in that test).', 18)
  });
  C('char.mixed_revisions', 'notes', /^Files in this folder were written for different SWAT\+ revisions/, 'Files in this folder were written for different SWAT+ revisions (61.0.2, 62). Minority files: codes.bsn. This is flagged for you to check, not as an error: the revision stamp records what wrote the file, not whether it still fits.', {
    plain: 'The first line of some files says they were written for a different SWAT+ revision than most of the folder. That can be harmless (the stamp only says what wrote the file) but is worth a look.',
    why: 'The stamp records which program and revision wrote the file, not whether the file still fits the engine you run. The tool flags it for you to check; it is not an error.',
    steps: [
      'Open the minority files named in the note and read their first line.',
      'If you edited or copied them from another project, check that they come from the same SWAT+ revision as the rest.',
      'If in doubt, write the input files again from the SWAT+ Editor so all files share one revision.'],
    verify: 'Drop the folder again: the note disappears when all files carry the same revision.',
    evidence: ev(COM, 'Tool inference from the file headers; not tested against an engine here (see pilot case #18 for one mixed-layout test that did no harm).')
  });
  C('char.swatmf_no_mf_files', 'missing', /^SWAT-MODFLOW linkage was detected, but no MODFLOW model files/, 'SWAT-MODFLOW linkage was detected, but no MODFLOW model files. Add the MODFLOW folder to check the two together.', {
    plain: 'The SWAT side of a SWAT-MODFLOW project is here, but the MODFLOW folder is not. The tool can check the SWAT side only, not the coupling.',
    why: 'Most SWAT-MODFLOW failures measured in the benchmark involve both sides (the name file, the stress periods against the SWAT period). Without the MODFLOW files those checks cannot run.',
    steps: [
      'Find the MODFLOW folder of the project (it holds the `.mfn` name file and the package files).',
      'Drop the parent folder that contains both, or add the MODFLOW folder to the selection.'],
    verify: 'Drop both again: this message should disappear and the label should show the groundwater model.',
    evidence: ev(COM, 'Tool inference from the files in the upload; the missing upload itself is not tested against an engine here (pilot cases #8 and #10 show the coupled checks that need both sides).')
  });
  C('char.swat_mf_no_link', 'notes', /^A MODFLOW model sits next to SWAT2012 but no swatmf linkage file was found/, 'A MODFLOW model sits next to SWAT2012 but no swatmf linkage file was found.', {
    plain: 'A MODFLOW model is next to a SWAT2012 model, but no `swatmf` linkage file was found. The tool treats them as two separate models.',
    why: 'SWAT-MODFLOW reads `swatmf_link.txt` at start-up (pilot case #9: without it the coupled run crashed). Without that file the tool does not call the pair a coupling.',
    steps: [
      'If you intend a SWAT-MODFLOW coupling, look for `swatmf_link.txt` in the SWAT folder and add it to the upload.',
      'Or regenerate it with the linking step in QSWATMOD.',
      'If the two models are independent, nothing needs to be done.'],
    verify: 'Drop the folder again with the link file: the label should change to SWAT-MODFLOW.',
    evidence: ev(MH, 'pilot case #9 (results/pilot_table.md) shows what happens when the link file is missing'),
    engine: eng('SWAT-MODFLOW', 'with `swatmf_link.txt` deleted, crashed with an end-of-file error (exit code 24), with no message naming the cause.', 9)
  });
  C('char.apexmf_leftovers', 'notes', /^Files named apexmf_\* sit next to this SWAT model/, 'Files named apexmf_* sit next to this SWAT model. They look like leftovers from an APEX-MODFLOW model.', {
    plain: 'Files named `apexmf_*` are in a SWAT folder. They belong to APEX-MODFLOW and look like leftovers copied in by mistake. The tool ignores them for the classification.',
    why: 'APEX-MODFLOW uses the `apexmf_` names; a SWAT model does not read them. Based on the file names; ' + NOT_REPRODUCED + '.',
    steps: [
      'If the folder is a SWAT model, you can leave them, or move them out to keep the folder clean.',
      'If it is really an APEX-MODFLOW project, drop the APEX folder as well.'],
    verify: 'Nothing to fix; this note is informational.',
    evidence: ev(COM, 'Tool inference from file names; ' + NOT_REPRODUCED + '.')
  });
  C('char.swat2012_mf6', 'notes', /^SWAT2012 with MODFLOW 6 is not a standard coupling/, 'SWAT2012 with MODFLOW 6 is not a standard coupling; check that these belong together.', {
    plain: 'A SWAT2012 model and a MODFLOW 6 model are together in the upload. SWAT-MODFLOW normally uses an older MODFLOW, so check that these two really belong together.',
    why: 'The standard SWAT-MODFLOW coupling uses the older MODFLOW family; MODFLOW 6 with SWAT2012 is unusual, so the tool lowers its confidence in the pair.',
    steps: [
      'Confirm that the two folders come from the same project.',
      'If they are unrelated, drop them separately.'],
    verify: 'Drop them separately or the right pair: the label and confidence should change.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.swatmf_leftovers', 'notes', /^Files named swatmf_\* sit next to this APEX model/, 'Files named swatmf_* sit next to this APEX model. APEX-MODFLOW uses apexmf_* names, so these look like leftovers from a SWAT-MODFLOW model copied into the folder. They are ignored for the classification.', {
    plain: 'Files named `swatmf_*` are in an APEX folder. They belong to SWAT-MODFLOW and look like leftovers from copying another model. The tool ignores them.',
    why: 'APEX-MODFLOW uses `apexmf_*` names. These leftovers do not harm the APEX model by themselves; based on the file names, ' + NOT_REPRODUCED + '.',
    steps: [
      'If the folder is an APEX model, move the `swatmf_*` files out to keep it clean.',
      'If it is really a SWAT-MODFLOW project, drop the SWAT folder as well.'],
    verify: 'Nothing to fix; this note is informational.',
    evidence: ev(COM, 'Tool inference from file names; ' + NOT_REPRODUCED + '.')
  });
  C('char.apexmf_no_mf', 'missing', /^APEX-MODFLOW linkage files were found but no MODFLOW model/, 'APEX-MODFLOW linkage files were found but no MODFLOW model. Add the MODFLOW folder to check the pair.', {
    plain: 'The APEX side of an APEX-MODFLOW project is here, but the MODFLOW folder is not. The tool can check the APEX side only.',
    why: 'APEX-MODFLOW needs both models. Without the MODFLOW files the tool cannot check anything about the pair.',
    steps: [
      'Find the MODFLOW folder of your project (often a sub-folder next to the APEX inputs).',
      'Drop the parent folder that holds both.'],
    verify: 'Drop both again: this message should disappear.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });
  C('char.gw_link_no_surface', 'missing', /^Linkage files point to a SWAT model, but no SWAT or SWAT\+ folder was provided/, 'Linkage files point to a SWAT model, but no SWAT or SWAT+ folder was provided. Drop the parent folder to check the pair.', {
    plain: 'The MODFLOW folder has files that link it to a SWAT model, but the SWAT folder is not in the upload. The tool checks only the MODFLOW side.',
    why: 'The coupled checks (for example the stress periods against the SWAT period, pilot case #8) need both sides.',
    steps: [
      'Find the SWAT or SWAT+ folder of the project.',
      'Drop the parent folder that contains both.'],
    verify: 'Drop both again: this message should disappear and the pair should be checked together.',
    evidence: ev(COM, 'Tool inference from the files in the upload; the missing upload itself is not tested against an engine here (pilot case #8 shows what a coupled check finds).')
  });
  C('char.gw_ambiguous', 'notes', /^This upload has \d+ surface models and this groundwater model is equally close/, 'This upload has 2 surface models and this groundwater model is equally close to several of them, so it was not attached to any. Drop it together with its own SWAT / SWAT+ / APEX folder to check the pair.', {
    plain: 'There are several surface models in the upload and the groundwater model is equally close to more than one, so the tool did not pair it with any of them. It will not guess.',
    why: 'Pairing by guesswork could check the wrong two models together and report problems that are not yours. The tool leaves the model unattached instead.',
    steps: [
      'Drop the groundwater model together with only its own SWAT, SWAT+ or APEX folder.',
      'Or check each surface model on its own and keep the groundwater model separate.'],
    verify: 'Drop the pair on its own: the groundwater model should be listed under the surface model.',
    evidence: ev(COM, 'Tool design choice (do not guess a pairing); not tested against an engine.')
  });
  C('char.gw_alone', 'notes', /^Only a groundwater model was provided/, 'Only a groundwater model was provided. If it is part of a SWAT / SWAT+ / APEX coupling, drop that folder too and the pair will be checked together.', {
    plain: 'Only a groundwater model is in the upload. If it is meant to be coupled to SWAT, SWAT+ or APEX, the tool can only check the groundwater side.',
    why: 'Checks that look at both models together (such as the stress periods against the SWAT period) need the surface model as well.',
    steps: [
      'If it is a coupled model, drop the parent folder that holds the SWAT / SWAT+ / APEX folder too.',
      'If it is a stand-alone groundwater model, nothing needs to be done.'],
    verify: 'Drop both folders: the pair should be checked together.',
    evidence: ev(COM, 'Tool inference from the files in the upload; not tested against an engine here.')
  });

  /* ═══════════════════ lookup and presentation ═══════════════════ */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function txt(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }

  HDA.EVIDENCE_KINDS = EVIDENCE_KINDS;
  HDA.ADVICE = LIST;
  HDA.CHAR_ADVICE = CHAR;
  HDA.adviceView = 'plain';

  HDA.evidenceLabel = function (e) { return e.inferred ? 'inferred from your files, not tested' : e.kind; };

  HDA.adviceFor = function (title) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].re.test(title)) return LIST[i];
    return null;
  };
  HDA.charAdviceFor = function (kind, text) {
    for (var i = 0; i < CHAR.length; i++) if (CHAR[i].kind === kind && CHAR[i].re.test(text)) return CHAR[i];
    return null;
  };

  /* the evidence kind as a small label next to the title */
  HDA.adviceChipHTML = function (a) {
    if (!a || !a.evidence) return '';
    var cls = { 'measured here': 'ev-m', 'read in the engine source': 'ev-s', 'documented': 'ev-d', 'community-reported': 'ev-c' }[a.evidence.kind] || 'ev-c';
    var label = HDA.evidenceLabel(a.evidence);
    return '<span class="evchip ' + cls + '" title="How we know this: ' + esc(label) + '">' + esc(label) + '</span>';
  };
  /* plain view: what is wrong, what to do, how to check */
  HDA.advicePlainHTML = function (a) {
    var h = '<div class="adv-plain"><div class="adv-lead">' + txt(a.plain) + '</div>';
    if (a.steps && a.steps.length) h += '<ol class="adv-steps">' + a.steps.map(function (s) { return '<li>' + txt(s) + '</li>'; }).join('') + '</ol>';
    if (a.verify) h += '<div class="adv-verify"><b>How to check it worked:</b> ' + txt(a.verify) + '</div>';
    return h + '</div>';
  };
  /* technical view, the part that comes from the advice table (the rule's own detail and fix are added by the caller) */
  HDA.adviceTechHTML = function (a) {
    var h = '';
    if (a.why) h += '<div class="adv-why"><b>What the model does with it:</b> ' + txt(a.why) + '</div>';
    if (a.evidence) h += '<div class="adv-evid"><b>Evidence:</b> ' + esc(HDA.evidenceLabel(a.evidence)) + ' &mdash; ' + txt(a.evidence.ref) + '</div>';
    return h;
  };
  /* shown in both views: what the engine itself did in the injected-fault benchmark (results/pilot_table.md) */
  HDA.adviceEngineHTML = function (a) {
    if (!a || !a.engine) return '';
    var list = Array.isArray(a.engine) ? a.engine : [a.engine];
    return list.map(function (e) {
      return '<div class="adv-engine"><b>What ' + esc(e.name) + ' itself said:</b> ' + txt(e.said) + ' <span class="muted">(benchmark, pilot case #' + e.pilot + ')</span></div>';
    }).join('');
  };
  /* the Plain words / Technical switch; the page script keeps every copy of it in step (aria-pressed) */
  HDA.adviceSwitchHTML = function () {
    var v = HDA.adviceView === 'tech' ? 'tech' : 'plain';
    return '<div class="advsw" role="group" aria-label="How to show the advice">' +
      '<button type="button" class="advsw-b" data-advview="plain" aria-pressed="' + (v === 'plain') + '">Plain words</button>' +
      '<button type="button" class="advsw-b" data-advview="tech" aria-pressed="' + (v === 'tech') + '">Technical</button></div>';
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
