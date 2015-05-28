import Line from './line';
import _ from 'underscore';


const colors = ['red', 'blue', 'green', 'purple']

export default class Chromatogram extends Line {
  constructor(sequenceCanvas, options = {}) {
    super();
    this.sequenceCanvas = sequenceCanvas;
    _.extend(this, options);
  }

  draw(x, y, [fromBase, toBase]) {
    const sequenceCanvas = this.sequenceCanvas;
    const artist = sequenceCanvas.artist;
    const layoutSettings = sequenceCanvas.layoutSettings;
    const layoutHelpers = sequenceCanvas.layoutHelpers;
    const pageMargins = layoutSettings.pageMargins;
    const blocksPerRow = layoutHelpers.basesPerRow / layoutSettings.basesPerBlock;
    const effectiveWidth = blocksPerRow * layoutSettings.basesPerBlock *
      layoutSettings.basePairDims.width +
      (blocksPerRow - 1) * layoutSettings.gutterWidth;
    const sequence = sequenceCanvas.sequence;
    const rawData = sequence.get('chromatogramData');
    const maxDataValue = sequence.get('maxChromatogramValue') || 65536;

    const peaks = sequence.get('chromatogramPeaks');
    // const dataRelevantLength = rawData[0].length + 0*(peaks[peaks.length - 1] + 14);
    const dataRelevantLength = rawData[0].length;
    const dataRelevantOffset = 0 + 0*(rawData[0].length - peaks[peaks.length-1]);

    const dataDensity = Math.floor( dataRelevantLength / sequence.length());

    // const xInterval =  effectiveWidth / (toBase - fromBase + 1) / dataDensity;
    const xInterval =  1;
    const height = this.height;

    const relevantRawData = _.map(rawData, function(data) {
      // return data.slice(dataRelevantOffset + fromBase * dataDensity, dataRelevantOffset + toBase * dataDensity);
      // return data.slice(dataDensity * fromBase, dataDensity * (toBase+1));
      var start = Math.max(fromBase-1, 0),
          end = toBase;
      return data.slice(peaks[start], peaks[end]);
    });

    // debugger

    var allPoints = _.map(relevantRawData, function(rawData_) {
      return _.map(rawData_, function(data, i) {
        // console.log(i, i*xInterval, data, data/maxDataValue)
        // return [x + pageMargins.left + i * xInterval, y + height * ( 1 - data / maxDataValue)];
        return [x + i * xInterval, y + height * ( 1 - data / maxDataValue)];
      });
    });

    // console.log(rawData)
    // console.log(peaks)

    artist.updateStyle({
      lineWidth: 1
    });

    // _.each(points, function(point) {
    //   artist.rect(point[0], point[1], 1, y + height - point[1]);
    // });
    //

    // console.log("chrom", x, y, [fromBase, toBase])

    // artist.rect(x, y, peaks[toBase]-peaks[fromBase], 100, {
    //   fillStyle: "#"+((1<<24)*Math.random()|0).toString(16)
    // })

    var start = Math.max(fromBase-1, 0),
        end = toBase;

    artist.clear(x, y, peaks[end]-peaks[start], height);


    _.each(allPoints, function(points, i) {
      if (points.length){
        artist.path(..._.flatten(points), {strokeStyle: colors[i]});
      }
    });

    // artist.smoothLineGraph(points);


  }
}
