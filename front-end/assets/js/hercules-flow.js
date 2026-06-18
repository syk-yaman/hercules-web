var deckgl = null;
var experiment = null;
var changeExperiment = null;
var backgroundImage = null;
var errorCallback;
var mapData;
var currentTime = 0;

var layers = [];
var mapGLLayers = [];
var mainDeck;

//A flag to pause/play the animation.
var isAnimating = false;

//A flag to kick off the first animation when the page is loaded (just used once).
var firstLoad = true;

//this a manual ticks coming from the slider when the user selects a time manually
var manualTime = -1;

//this flag is set to 1 to indicate that the slider is clicked while being dragged. It is set to 0 when the
//click is released (the user no longer is dragging the slider)
var manualPressed = 0;

//A function resposible of animating each frame (called on each tick to animate the frame)
var animate;

//This variable is used to compate current minute and past minute, this useful for updating the slider
var previousMinutes = -1;

var isHoveringOnSlider = false;

var url = new URL("https://hercules.cetools.org/v1/");
url.port = '443';
const baseURL = url.toString();

// Sensor definitions
const sensors = [
    { id: 1, rect: { x: 0.05525, y: 0.07417, width: 0.012, height: 0.002 }, name: 'S1', enteredPatients: new Set(), color: [255, 140, 0] },
    { id: 2, rect: { x: 0.06535, y: 0.07417, width: 0.012, height: 0.002 }, name: 'S2', enteredPatients: new Set(), color: [0, 128, 255] },
    { id: 3, rect: { x: 0.07565, y: 0.07417, width: 0.012, height: 0.002 }, name: 'S3', enteredPatients: new Set(), color: [255, 0, 128] },
    { id: 4, rect: { x: 0.08585, y: 0.07417, width: 0.012, height: 0.002 }, name: 'S4', enteredPatients: new Set(), color: [128, 255, 0] }
].map(sensor => {
    const { x, y, width, height } = sensor.rect;
    return {
        ...sensor,
        polygon: [
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height]
        ],
        center: [
            x + width / 2,
            y + height / 2
        ]
    };
});

const INITIAL_VIEW_STATE = {
    latitude: 0.090,
    longitude: 0.171,
    zoom: 10.5, //default for screen width 1686, will be changed dynamically during page load 
    bearing: 0,
    pitch: 0
};

const COLOR_RANGE = [
    [1, 152, 189],
    [73, 227, 206],
    [216, 254, 181],
    [254, 237, 177],
    [254, 173, 84],
    [209, 55, 78]
];

function isPointInPolygon(point, polygon) {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i][0], yi = polygon[i][1];
        var xj = polygon[j][0], yj = polygon[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

(function ($) {
    'use strict';
    $(function () {

        if (experiment == null) {
            // Assume Experiment 1
            experiment = "1";
            backgroundImage = "p" + experiment + "-ubi-grid.png";
            updatePatientList(experiment);
        }

        var softSlider = document.getElementById('soft-limit');

        function updatePips(value, type) {
            return value + " min";
        }

        noUiSlider.create(softSlider, {
            start: [0],
            tooltips: false,
            behaviour: 'hover-snap',
            connect: true,
            range: {
                min: 0,
                max: 60
            },
            pips: {
                mode: 'values',
                values: range(0, 61, 15),
                density: 15,
                format: { to: updatePips }
            }
        });

        softSlider.noUiSlider.on('start', function (values, handle) {
            console.log("start");
            pausePlayback();
            manualPressed = 1;
        });

        softSlider.noUiSlider.on('change', function (values, handle) {
            manualTime = parseFloat(values[handle]);
            console.log("change: " + manualTime);
            manualPressed = 0;

            //Auto play is disabled after feedback
            startPlayback();
            // This is to allow 1 frame (or tick) to be visualised, otherwise when the user drags and releases the time slider
            // he can't see what's changed (the old frame before dragging and dropping is still on screen and it's not updated).
            // So, this trick allows the playback to go on for 50 milliseconds an then auto pause, allowing approximately 1 new 
            // frame to be shown.. 
            setTimeout(pausePlayback, 50);
        });

        softSlider.noUiSlider.on('hover', function (values, handle) {
            isHoveringOnSlider = true;
            //console.log("hover: "+ values[handle]);
        });

        $(".js-example-basic-single").select2();

        function updatePatientList(expID) {
            var patientList;
            if (expID == "1") {
                patientList = patients1;
            } else if (expID == "2") {
                patientList = patients2;
            } else if (expID == "3") {
                patientList = patients3;
            } else if (expID == "4") {
                patientList = patients4;
            }

            $('#patient-menu')
                .find('option')
                .remove()
                .end();

            $('#patient-menu').append($('<option>', {
                value: null,
                text: "Search patients"
            }));

            $.each(patientList, function (i, item) {
                $('#patient-menu').append($('<option>', {
                    value: item,
                    text: item
                }));
            });
        }

        $('#patient-menu').on('change', function (e) {
            var valueSelected = this.value;
            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
            $('[id*="condition"]').removeClass("active");
            $('[id*="day"]').removeClass("active");
            $('[id*="-tod"]').removeClass("active");

            resetLegend();

        });

        $('#triple-lane-glaucoma').click(function () {
            changeExperiment(1, false);
            var valueSelected = "G0530";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#cubicle-change').click(function () {
            changeExperiment(1, false);
            var valueSelected = "G0501";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#slowest-patient').click(function () {
            changeExperiment(4, false);
            var valueSelected = "R2347";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#wanderer-patient').click(function () {
            changeExperiment(4, false);
            var valueSelected = "G3129";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#no-patient').click(function () {
            changeExperiment(1, false);
            var valueSelected = "R0718";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#uncomlpete-glaucoma2').click(function () {
            changeExperiment(2, false);
            var valueSelected = "G1304";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#uncomlpete-glaucoma').click(function () {
            changeExperiment(3, false);
            var valueSelected = "G4013";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        $('#uncomlpete-cataract').click(function () {
            changeExperiment(4, false);
            var valueSelected = "C0314";

            lookupPatient(valueSelected, function (patData) {
                loadMapData(patData, 1, "Patient " + valueSelected, true);
                startPlayback();
            });
        });

        function lookupPatient(pat_id, callback) {
            const url = baseURL + 'api/data/flows/single/' + parseInt(experiment) + '/' + pat_id;
            console.log(url);
            showLoading();
            fetch(url)
                .then(response => response.json())
                .then(data => callback(data))
                .catch(error => errorCallback(error, function () { }));
            resetLegend();
        }

        function lookupExperimentPatients(callback) {
            const groupUrl = baseURL + 'api/data/flows/group/' + parseInt(experiment) + '/zerostart/' + 1 + '/colourconfig/' + 1;
            console.log(groupUrl);
            var patientList;
            if (experiment == "1") {
                patientList = patients1;
            } else if (experiment == "2") {
                patientList = patients2;
            } else if (experiment == "3") {
                patientList = patients3;
            } else if (experiment == "4") {
                patientList = patients4;
            }

            showLoading();
            fetch(groupUrl, {
                method: "POST",
                body:
                    JSON.stringify({
                        "group": patientList
                    }),
                headers: {
                    "Content-type": "application/json; charset=UTF-8"
                }
            })
                .then(response => response.json())
                .then(data => callback(data))
                .catch(error => errorCallback(error, function () { }));
        }

        changeExperiment = function changeExperiment(expID, loadAllTraces = true) {
            $("#dropdownMenuButtonExperiment").text("Experiment " + parseInt(expID));
            $("#exp" + experiment).removeClass("active");
            experiment = parseInt(expID);
            $("#exp" + experiment).addClass("active");
            backgroundImage = "p" + experiment + "-ubi-grid.png";
            isAnimating = false;

            updatePatientList(experiment);

            if (loadAllTraces)
                lookupExperimentPatients(function (patData) {
                    // show dates
                    //P1: 11/10/2021 - 12/11/2021 -  5w 
                    //P2: 30/11/2021 - 06/12/2021 -  1w
                    //P3: 23/02/2022 - 06/05/2022 - 12w 
                    //P4: 07/09/2022 - 27/02/2023 - 30w 
                    loadMapData(patData, null, parseInt(experiment), true);
                    console.log("changeExperiment");
                    resetLegend();
                });
        }

        //Taken from https://stackoverflow.com/questions/8273047/
        function range(start, stop, step) {
            if (typeof stop == 'undefined') {
                // one param defined
                stop = start;
                start = 0;
            }

            if (typeof step == 'undefined') {
                step = 1;
            }

            if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
                return [];
            }

            var result = [];
            for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
                result.push(i);
            }

            return result;
        };

        function loadMapData(data, individual, experimentName, resetCurrentTime) {
            //By default this causes the playback to reset, except in hiding 
            //patient type case, the playback should continue from the same position
            if (resetCurrentTime)
                currentTime = 0;

            var pageHeight = $(document).height()
            console.log("pageHeight: " + pageHeight);
            var deckglHeight = Math.round(pageHeight * 0.7); //0.36 is the magic number for the precentage of map to screen width
            //$("#deck-gl-wrapper")[0].style.setProperty("height", deckglHeight + "px", "important"); 
            console.log("deckglHeight: " + deckglHeight + "px");

            mapData = data;
            const TripsLayer = deck.TripsLayer;
            const LOOP_LENGTH = data == null ? 0 : data.ticks;
            console.log("LOOP_LENGTH " + LOOP_LENGTH);

            var minutes = parseInt(LOOP_LENGTH / 32);
            var hours = parseInt(Math.floor(minutes / 60));
            console.log("minutes " + minutes);

            if (data != null) {
                var rangeVal, density;
                if (minutes > 0 && minutes <= 45) {
                    rangeVal = range(0, minutes, 15);
                    density = 15;
                } else if (minutes > 120 && minutes <= 150) {
                    rangeVal = range(0, minutes, 30);
                    density = 30;
                } else {
                    rangeVal = range(0, minutes, 30);
                    density = 30;
                }

                softSlider.noUiSlider.updateOptions({
                    start: [0],
                    tooltips: false,
                    connect: true,
                    range: {
                        min: 0,
                        max: minutes
                    },
                    pips: {
                        mode: 'values',
                        values: rangeVal,
                        density: density,
                        format: { to: updatePips }
                    }
                });

            } else {
                //reset time slider if needed
                softSlider.noUiSlider.updateOptions({
                    start: [0],
                    tooltips: false,
                    connect: true,
                    range: {
                        min: 0,
                        max: 60
                    },
                    pips: {
                        mode: 'values',
                        values: range(0, 61, 15),
                        density: 15,
                        format: { to: updatePips }
                    }
                });
                //LOOP_LENGTH = 0;
                //currentTime = 0;
                $("#playback-name").text("Nothing selected");

            }


            const VENDOR_COLORS = [
                [255, 0, 0],
                [0, 0, 0],
            ];
            //currentTime = 0;

            const tripProps = {
                id: "trips",
                data: mapData?.paths,
                getPath: (d) => d.path,
                getTimestamps: (d) => d.timestamps,
                getColor: (d) => individual != null ? VENDOR_COLORS[0] : d.vendor,//d.vendor
                //opacity: individual!=null? 3 : 0.09,
                widthMinPixels: individual != null ? 4 : 2.5,
                trailLength: individual != null ? 3000 : 150,
                currentTime,
                shadowEnabled: false,
            };

            const sensorProps = {
                id: 'sensor-layer',
                data: sensors,
                pickable: false,
                opacity: 0.5,
                stroked: true,
                filled: true,
                getPolygon: d => d.polygon,
                getFillColor: d => d.color,
                getLineColor: [255, 0, 0]
            };

            const textLayerOptions = {
                id: 'sensor-text-layer',
                data: sensors,
                getPosition: d => d.center,
                getText: d => d.name,
                getSize: 16,
                getColor: [0, 0, 0, 255],
                getAngle: 0,
                getTextAnchor: 'middle',
                getAlignmentBaseline: 'center'
            };

            const iconProps = {
                id: 'IconLayer',
                data: mapData?.paths,
                getColor: d => [Math.sqrt(d.exits), 140, 0],
                getIcon: d => 'marker',
                getPosition: d => d.path[currentTime],
                getSize: 40,
                iconAtlas: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png',
                iconMapping: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.json',
                pickable: true
            };

            const bitmapProps = {
                id: 'bitmap-layer',
                bounds: [0.0, 0.0, 0.34441, 0.18209],
                image: './assets/floorplans/' + backgroundImage
            };

            //P1: 11/10/2021 - 12/11/2021 -  5w 
            //P2: 30/11/2021 - 06/12/2021 -  1w
            //P3: 23/02/2022 - 06/05/2022 - 12w 
            //P4: 07/09/2022 - 27/02/2023 - 30w 
            if (experimentName === 1)
                $("#playback-name").text("P1 11/10/2021-12/11/2021 -  5w");
            else if (experimentName === 2)
                $("#playback-name").text("P2 30/11/2021-06/12/2021 -  1w");
            else if (experimentName === 3)
                $("#playback-name").text("P3 23/02/2022-06/05/2022 - 12w");
            else if (experimentName === 4)
                $("#playback-name").text("P4 07/09/2022-27/02/2023 - 30w");
            else if (experimentName != null)
                $("#playback-name").text(experimentName);

            hideLoading();
            animate = () => {
                if (isAnimating || firstLoad) {
                    //console.log("cuurenttime old: " + currentTime);
                    if (individual != null)
                        currentTime = (currentTime + 1) % LOOP_LENGTH;
                    else
                        currentTime = (currentTime + 2) % LOOP_LENGTH;

                    if (manualTime != -1) {
                        console.log("currentTime MANUAL: " + currentTime);
                        currentTime = parseInt(manualTime * 32);
                        manualTime = -1;
                    }

                    //Auto pause the playback when loop ends
                    if (currentTime === LOOP_LENGTH - 2 || currentTime === LOOP_LENGTH - 1) {
                        currentTime = LOOP_LENGTH;
                        pausePlayback();
                    }
                    //console.log("currentTime + LOOP_LENGTH: " + currentTime + " + " + LOOP_LENGTH);
                    if (LOOP_LENGTH != 0) {
                        var currentMinutes = Math.round(currentTime / 32);
                        /* 
                            This condition is crucial for a smooth control of the slider; 
                            When the slider is being constantly updated during playback time, touch and drag events
                            are paused during the update, thus the user has to click several times to 'accidentally'
                            have one click while it's not being updated.
                            As a results, this condition disables the slider update to help the user in these states:
                                - Slider is being clicked by the user.
                                - The playback minutes count hasn't changed (in other words, no need to update the 
                                    slider every frame).
                                - User is hovering on the slider, this is as an anticipation for an incoming
                                    click (Otherwise the user might need to click several times as mentioned above).
                        */
                        if (manualPressed != 1 && previousMinutes != currentMinutes && !isHoveringOnSlider) {
                            softSlider.noUiSlider.set(parseInt(currentMinutes));
                        }

                        //Hovering is considered finised when the minutes count changes, if the user is still hovering,
                        //the noUiSlier will keep updating it accordingly. 
                        if (previousMinutes != currentMinutes) {
                            isHoveringOnSlider = false;
                        }
                        $('#time-index').text(convertMinsToHrsMins(currentMinutes));
                        previousMinutes = currentMinutes;
                    }
                    const tripsLayer = new TripsLayer({
                        ...tripProps,
                        currentTime,
                    });
                    const bitmapLayer = new deck.BitmapLayer({
                        ...bitmapProps
                    });

                    const sensorLayer = new deck.PolygonLayer({
                        ...sensorProps
                    });

                    const textLayer = new deck.TextLayer({
                        ...textLayerOptions
                    });

                    //const iconLayer = new deck.IconLayer({
                    //    ...iconProps,
                    //    getPosition: d => d.path[currentTime],
                    //  });

                    mainDeck.setProps({
                        layers: [bitmapLayer, tripsLayer, sensorLayer, textLayer],
                    });

                    // Check for patient-sensor collision
                    if (mapData && mapData.paths) {
                        mapData.paths.forEach(patient => {
                            const patientPosition = patient.path[currentTime];
                            if (patientPosition) {
                                sensors.forEach(sensor => {
                                    if (isPointInPolygon(patientPosition, sensor.polygon)) {
                                        if (!sensor.enteredPatients.has(patient.patID)) {
                                            sensor.enteredPatients.add(patient.patID);
                                            console.log(`Patient ${patient.patID} entered ${sensor.name}. Total patients in ${sensor.name}: ${sensor.enteredPatients.size}`);
                                        }
                                    }
                                });
                            }
                        });
                    }

                    window.requestAnimationFrame(animate);
                    //console.log("requestAnimationFrame: isAnimating");
                    firstLoad = false;
                }
            };

            // taken from https://stackoverflow.com/questions/4687723/
            function convertMinsToHrsMins(minutes) {
                var h = parseInt(Math.floor(minutes / 60));
                var m = parseInt(minutes % 60);
                h = h < 10 ? '0' + h : h;
                m = m < 10 ? '0' + m : m;
                return h + ':' + m + ':00';
            }

            async function initMap() {
                console.log("initMap()");

                mainDeck = new deck.Deck({
                    container: 'deck-gl-wrapper',
                    initialViewState: INITIAL_VIEW_STATE,
                    layers: [
                        new TripsLayer({
                            tripProps
                        }),
                        new deck.BitmapLayer({
                            bitmapProps
                        }),
                        new deck.PolygonLayer({
                            ...sensorProps
                        }),
                        new deck.TextLayer({
                            ...textLayerOptions
                        })
                        //new deck.IconLayer({
                        //    iconProps
                        //  })
                    ],
                    onAfterRender
                });

                //Auto zoom inside our pre-determined longitude & latitude (0 to 0.344410000) and (0 to 0.182090000)
                function onAfterRender() {
                    const viewport = mainDeck.layerManager.layers[1].context.viewport;
                    const { longitude, latitude, zoom } = viewport.fitBounds([[0, 0], [0.344410000, 0.182090000]], { padding: 0, duration: 1000 });
                    //console.log("onAfterRender: "+longitude +", " + latitude + ", " + zoom);
                    mainDeck.setProps({
                        initialViewState: { longitude, latitude, zoom }
                    });
                }

                startPlayback();
                console.log("requestAnimationFrame: initMap");
            }

            window.initMap = initMap;
            console.log(" window.initMap");
            initMap();

            document.getElementById('deck-gl-wrapper').appendChild(mainDeck.canvas);
        }



        function pausePlayback() {
            isAnimating = false;
            $('#play-button').removeClass("mdi-pause");
            $('#play-button').addClass("mdi-play");
        }

        function startPlayback() {
            if (!isAnimating) {
                isAnimating = true;
                $('#play-button').removeClass("mdi-play");
                $('#play-button').addClass("mdi-pause");
                window.requestAnimationFrame(animate);
                console.log("requestAnimationFrame: startPlayback");
            }
        }

        function showLoading() {
            $(".circle-loader").show();
        }

        function hideLoading() {
            $(".circle-loader").hide();
        }

        $('#playback-button').click(function () {
            if (isAnimating) {
                pausePlayback();
            } else {
                startPlayback();
            }
            //loadMapData();
        });

        $('#reset').click(function () {
            location.reload();
        });

        $('#changeColour').click(function () {
            updateVendorValues2(mapData);
            loadMapData(mapData, null, null, false);
        });

        $('[id*="condition"]').click(function () {
            $('[id*="condition"]').removeClass("active");
            console.log(this.id);
            $(this).addClass("active");
            $("#dropdownCondition").text(this.text);
        });

        $('[id*="day"]').click(function () {
            $('[id*="day"]').removeClass("active");
            console.log(this.id);
            $(this).addClass("active");
            $("#dropdownDay").text(this.text);
        });

        function updateVendorValues(data, type, isHidden) {
            data.paths.forEach(path => {
                if (path.patID.toLowerCase().startsWith(type)) {
                    if (isHidden)
                        path.vendor = [path.vendor[0], path.vendor[1], path.vendor[2], 0];
                    else
                        path.vendor = [path.vendor[0], path.vendor[1], path.vendor[2], 100];
                }
            });
        }

        function updateVendorValues2(data) {
            let maxTimestamp = 0;
            data.paths.forEach(path => {
                const pathMaxTimestamp = Math.max(...path.timestamps);
                if (pathMaxTimestamp > maxTimestamp) {
                    maxTimestamp = pathMaxTimestamp;
                }
            });

            console.log("maxTimestamp" + maxTimestamp);
            // Step 2: Update the first part of each vendor color based on the relative value
            data.paths.forEach(path => {
                // Calculate the relative value
                const lastTimestamp = path.timestamps[path.timestamps.length - 1];

                path.vendor = interpolateColor(lastTimestamp, 0, maxTimestamp);
            });
        }

        // Helper function to interpolate between colors
        function interpolateColor(value, min, max) {
            const ratio = (value - min) / (max - min);
            if (ratio <= 0.33) {
                // Interpolate from green to yellow
                const green = Math.floor(255 * (3 - 3 * ratio));
                return [255, green, 0, 100]; // Yellow to Green
            } else if (ratio <= 0.66) {
                // Interpolate from yellow to orange
                const red = 255;
                const green = Math.floor(255 * (2 - 3 * ratio));
                return [red, green, 0, 100]; // Orange to Yellow
            } else {
                // Interpolate from orange to red
                const red = 255;
                const green = Math.floor(255 * (1 - 3 * ratio));
                return [red, green, 0, 255]; // Red to Orange
            }
        }

        function resetLegend() {
            for (const element of $('[id*="legend"]')) {
                $(element).css("text-decoration", "auto");
                var style = $(element).attr('style');
                style = style.replace("color: rgb(175, 175, 175) !important;", "");
                $(element).attr('style', style);
            }
        }

        $('[id*="legend"]').click(function () {
            var content = this.id;
            const lastChar = content.match(/.$/)[0];

            if ($(this).css("text-decoration").includes("line-through")) {
                $(this).css("text-decoration", "auto");
                var style = $(this).attr('style');
                style = style.replace("color: rgb(175, 175, 175) !important;", "");
                $(this).attr('style', style);

                console.log(content);
                updateVendorValues(mapData, lastChar, false);
            } else {
                $(this).css("text-decoration", "line-through");
                var style = $(this).attr('style');
                var styles = "color: #afafaf !important; " + ' ' + style;
                $(this).attr('style', styles);
                console.log(content);
                updateVendorValues(mapData, lastChar, true);
            }
            loadMapData(mapData, null, null, false);
        });



        $('[id*="-tod"]').click(function () {
            $('[id*="-tod"]').removeClass("active");
            console.log(this.id);
            $(this).addClass("active");
            $("#dropdownTod").text(this.text);
        });

        $('#visualise-results').click(function () {
            pausePlayback();
            var selectedCondition = $('[id*="condition"]').filter(function () {
                return ($(this).hasClass("active"));
            });

            var selectedDay = $('[id*="day"]').filter(function () {
                return ($(this).hasClass("active"));
            });

            var selectedTod = $('[id*="tod"]').filter(function () {
                return ($(this).hasClass("active"));
            });

            requestData(selectedCondition, selectedDay, selectedTod);

        });


        lookupExperimentPatients(function (patData) {
            loadMapData(patData, null, parseInt(experiment), true);
            startPlayback();
        });

        errorCallback = function showError(error, func) {
            console.log("+++++++++++++++++++++ Server error: " + error);
            hideLoading();
            //alert("Sorry for the inconvenience, there was a server-side error.");
            func();
        }

        function requestData(selectedCondition, selectedDay, selectedTod) {
            if (selectedCondition.length > 0) {
                var apiSelectedCondition;
                switch (selectedCondition[0].id) {
                    case 'gcondition':
                        apiSelectedCondition = 'G';
                        break;
                    case 'rcondition':
                        apiSelectedCondition = 'R';
                        break;
                    case 'ccondition':
                        apiSelectedCondition = 'C';
                        break;
                    case 'scondition':
                        apiSelectedCondition = 'S';
                        break;
                }

                const conditionUrl = baseURL + 'api/data/' + parseInt(experiment) + '/condition_type/' + apiSelectedCondition;
                const groupUrl = baseURL + 'api/data/flows/group/' + parseInt(experiment) + '/zerostart/' + 1 + '/colourconfig/' + 0;
                console.log(conditionUrl);
                console.log(groupUrl);

                showLoading();
                fetch(conditionUrl)
                    .then(response => response.json())
                    .then(function (data) {
                        fetch(groupUrl, {
                            method: "POST",
                            body:
                                JSON.stringify({
                                    "group": data.patient_list
                                }),
                            headers: {
                                "Content-type": "application/json; charset=UTF-8"
                            }
                        })
                            .then(response => response.json())
                            .then(function (data) {
                                console.log(data);
                                loadMapData(data, null, apiSelectedCondition + " condition", true);
                                startPlayback();
                            })
                            .catch(error => errorCallback(error, function () { }));
                    })
                    .catch(error => errorCallback(error, function () { }));
            } else if (selectedDay.length > 0) {
                const dayUrl = baseURL + 'api/data/' + parseInt(experiment) + '/dow/' + selectedDay[0].id;
                const groupUrl = baseURL + 'api/data/flows/group/' + parseInt(experiment) + '/zerostart/' + 0 + '/colourconfig/' + 1;
                console.log(dayUrl);
                console.log(groupUrl);
                showLoading();
                fetch(dayUrl)
                    .then(response => response.json())
                    .then(function (data) {
                        fetch(groupUrl, {
                            method: "POST",
                            body:
                                JSON.stringify({
                                    "group": data.patient_list
                                }),
                            headers: {
                                "Content-type": "application/json; charset=UTF-8"
                            }
                        })
                            .then(response => response.json())
                            .then(function (data) {
                                console.log(data);
                                loadMapData(data, null, selectedDay[0].id, true);
                                startPlayback();
                            })
                            .catch(error => errorCallback(error, function () { }));
                    })
                    .catch(error => errorCallback(error, function () { }));
            } else if (selectedTod.length > 0) {
                var apiSelectedTod;
                switch (selectedTod[0].id) {
                    case 'morning-tod':
                        apiSelectedTod = 'morning';
                        break;
                    case 'afternoon-tod':
                        apiSelectedTod = 'afternoon';
                        break;
                }

                const todUrl = baseURL + 'api/data/' + parseInt(experiment) + '/tod/' + apiSelectedTod;
                const groupUrl = baseURL + 'api/data/flows/group/' + parseInt(experiment) + '/zerostart/' + 0 + '/colourconfig/' + 1;
                console.log(todUrl);
                console.log(groupUrl);
                showLoading();
                fetch(todUrl)
                    .then(response => response.json())
                    .then(function (data) {
                        fetch(groupUrl, {
                            method: "POST",
                            body:
                                JSON.stringify({
                                    "group": data.patient_list
                                }),
                            headers: {
                                "Content-type": "application/json; charset=UTF-8"
                            }
                        })
                            .then(response => response.json())
                            .then(function (data) {
                                console.log(data);
                                loadMapData(data, null, apiSelectedTod, true);
                                startPlayback();
                            })
                            .catch(error => errorCallback(error, function () { }));
                    })
                    .catch(error => errorCallback(error, function () { }));
            }
        }

    });
})(jQuery);
