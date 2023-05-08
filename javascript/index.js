window.addEventListener('load', () => {
	addFormatButton('txt2img');
	addFormatButton('img2img');
});

function addFormatButton(type) {
	const lastButton = gradioApp().querySelector(`#${type}_style_create`);
	let formatButton = gradioApp().querySelector(`#${type}_format_prompt`);
	if (!lastButton || !lastButton.parentNode)
		return;
	formatButton = createFormatButton(`#${type}_format_prompt`, type);
	lastButton.parentNode.append(formatButton);
}

function createFormatButton(id, type) {
	const button = document.createElement('button');
	button.id = id;
	button.type = 'button';
	button.innerHTML = '🪄';
	button.title = 'Format prompt~🪄'
	button.className = 'lg secondary gradio-button tool svelte-1ipelgc';
	button.addEventListener('click', () => formatPrompts(type));
	return button;
}

function formatPrompts(type) {
	for (let kind of ['_prompt', '_neg_prompt']) {
		const prompt = gradioApp().querySelector(`#${type + kind} > label > textarea`);
		const result = formatPrompt(prompt.value);
		prompt.value = result;
		dispatchInputEvent(prompt);
	}
}

function dispatchInputEvent(target) {
	let inputEvent = new Event('input');
	Object.defineProperty(inputEvent, 'target', { value: target });
	target.dispatchEvent(inputEvent);
}

function round(value) {
	return Math.round(value * 10000) / 10000
}

function convertStr(str) {
	return str.replace(/：/g, ':').replace(/（/g, '(').replace(/）/g, ')')
}

function convertStr2Array(str) {
	const bracketRegex = /([()<>[\]])/g

	const splitByBracket = str => {
		const arr = []
		let start = 0
		let depth = 0
		let match
		while ((match = bracketRegex.exec(str)) !== null) {
			if (depth === 0 && match.index > start) {
				arr.push(str.substring(start, match.index))
				start = match.index
			}
			if (match[0] === '(' || match[0] === '<' || match[0] === '[') {
				depth++
			} else if (match[0] === ')' || match[0] === '>' || match[0] === ']') {
				depth--
			}
			if (depth === 0) {
				arr.push(str.substring(start, match.index + 1))
				start = match.index + 1
			}
		}
		if (start < str.length) {
			arr.push(str.substring(start))
		}
		return arr
	}

	const splitByComma = str => {
		const arr = []
		let start = 0
		let inBracket = false
		for (let i = 0; i < str.length; i++) {
			if (str[i] === ',' && !inBracket) {
				arr.push(str.substring(start, i).trim())
				start = i + 1
			} else if (str[i].match(bracketRegex)) {
				inBracket = !inBracket
			}
		}
		arr.push(str.substring(start).trim())
		return arr
	}

	const cleanStr = str => {
		let arr = splitByBracket(str)
		arr = arr.flatMap((s) => splitByComma(s))
		return arr.filter((s) => s !== '')
	}

	return cleanStr(str)
		.filter((item) => {
			const pattern = /^[,\s，　]+$/
			return !pattern.test(item)
		})
		.filter(Boolean)
		.sort((a, b) => {
			return a.includes('<') && !b.includes('<') ? 1 : b.includes('<') && !a.includes('<') ? -1 : 0
		})
}

function convertArray2Str(array) {
	const newArray = array.map((item) => {
		if (item.includes('<')) return item
		const newItem = item
			.replace(/\s+/g, ' ')
			.replace(/，|\.\|。/g, ',')
			.replace(/“|‘|”|"|\/'/g, '')
			.replace(/, /g, ',')
			.replace(/,,/g, ',')
			.replace(/,/g, ', ')
		return convertStr2Array(newItem).join(', ')
	})
	return newArray.join(', ')
}

function formatPrompt(input) {
	const re_attention = /\{|\[|\}|\]|[^{}[\]]+/gmu

	let text = convertStr(input)
	const textArray = convertStr2Array(text)
	text = convertArray2Str(textArray)

	let res = []

	const curly_bracket_multiplier = 1.05
	const square_bracket_multiplier = 1 / 1.05

	const brackets = {
		'{': { stack: [], multiplier: curly_bracket_multiplier },
		'[': { stack: [], multiplier: square_bracket_multiplier },
	}

	function multiply_range(start_position, multiplier) {
		for (let pos = start_position; pos < res.length; pos++) {
			res[pos][1] = round(res[pos][1] * multiplier)
		}
	}

	for (const match of text.matchAll(re_attention)) {
		let word = match[0]

		if (word in brackets) {
			brackets[word].stack.push(res.length)
		} else if (word === '}' || word === ']') {
			const bracket = brackets[word === '}' ? '{' : '[']
			if (bracket.stack.length > 0) {
				multiply_range(bracket.stack.pop(), bracket.multiplier)
			}
		} else {
			res.push([word, 1.0])
		}
	}

	Object.keys(brackets).forEach((bracketType) => {
		brackets[bracketType].stack.forEach((pos) => {
			multiply_range(pos, brackets[bracketType].multiplier)
		})
	})

	if (res.length === 0) {
		res = [['', 1.0]]
	}

	let i = 0
	while (i + 1 < res.length) {
		if (res[i][1] === res[i + 1][1]) {
			res[i][0] += res[i + 1][0]
			res.splice(i + 1, 1)
		} else {
			i += 1
		}
	}

	let result = ''
	for (const [word, value] of res) {
		result += value === 1.0 ? word : `(${word}:${value.toString()})`
	}
	return result
}
