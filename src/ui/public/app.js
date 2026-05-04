(function () {
  const app = document.getElementById('app')
  const commandEl = document.getElementById('command')
  const statusEl = document.getElementById('status')
  const copyBtn = document.getElementById('copy-btn')
  const state = {}
  const fieldRegistry = new Map()
  let manifest = null
  let refreshTimer = null

  function setStatus (message, kind) {
    statusEl.textContent = message
    commandEl.classList.remove('ok', 'warn')
    if (kind) commandEl.classList.add(kind)
  }

  function matchesCondition (condition) {
    if (!condition) return true
    if (Array.isArray(condition)) return condition.every(matchesCondition)

    if (Object.prototype.hasOwnProperty.call(condition, 'key')) {
      const value = state[condition.key]
      if (Object.prototype.hasOwnProperty.call(condition, 'truthy')) {
        return Boolean(value) === condition.truthy
      }
      if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
        return value === condition.equals
      }
      if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
        return value !== condition.notEquals.value
      }
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
      const descriptor = condition.notEquals
      if (
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, 'key')
      ) {
        return state[descriptor.key] !== descriptor.value
      }
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'ecosystemSelected')) {
      return (
        Array.isArray(state.ecosystems) &&
        state.ecosystems.includes(condition.ecosystemSelected)
      )
    }
    if (Array.isArray(condition.anyEcosystemSelected)) {
      return condition.anyEcosystemSelected.some(
        (item) =>
          Array.isArray(state.ecosystems) && state.ecosystems.includes(item)
      )
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'not')) {
      return !matchesCondition(condition.not)
    }
    if (Array.isArray(condition.all)) {
      return condition.all.every(matchesCondition)
    }
    if (Array.isArray(condition.any)) {
      return condition.any.some(matchesCondition)
    }
    return true
  }

  function visible (field) {
    return matchesCondition(field.showIf)
  }

  function applyInputValue (field, input) {
    if (field.type === 'boolean') {
      state[field.key] = Boolean(input.checked)
      return
    }
    if (field.type === 'multiselect') {
      state[field.key] = Array.from(input.selectedOptions).map(
        (option) => option.value
      )
      return
    }
    if (field.type === 'number') {
      state[field.key] = input.value === '' ? '' : Number(input.value)
      return
    }
    state[field.key] = input.value
  }

  function applyStateToInput (field, input) {
    const value = state[field.key]
    if (field.type === 'boolean') {
      input.checked = Boolean(value)
      return
    }
    if (field.type === 'multiselect') {
      const selected = new Set(Array.isArray(value) ? value : [])
      for (const option of input.options) {
        option.selected = selected.has(option.value)
      }
      return
    }
    input.value = value == null ? '' : String(value)
  }

  function createFieldNode (field) {
    const wrapper = document.createElement('div')
    wrapper.className = 'field'
    wrapper.dataset.key = field.key
    const inputId = `field-${field.key}`
    let input

    if (field.type === 'boolean') {
      wrapper.classList.add('boolean-row')
      input = document.createElement('input')
      input.type = 'checkbox'
      input.id = inputId
      input.dataset.key = field.key
      wrapper.appendChild(input)

      const label = document.createElement('label')
      label.className = 'field-title'
      label.htmlFor = inputId
      label.textContent = field.label
      wrapper.appendChild(label)
    } else {
      const label = document.createElement('label')
      label.className = 'field-title'
      label.htmlFor = inputId
      label.textContent = field.label
      wrapper.appendChild(label)

      if (field.type === 'select') {
        input = document.createElement('select')
      } else if (field.type === 'multiselect') {
        input = document.createElement('select')
        input.multiple = true
      } else {
        input = document.createElement('input')
        input.type = field.type === 'number' ? 'number' : 'text'
        if (field.placeholder) input.placeholder = field.placeholder
      }

      if (field.type === 'select' || field.type === 'multiselect') {
        for (const option of field.options || []) {
          const opt = document.createElement('option')
          opt.value = option.value
          opt.textContent = option.label
          input.appendChild(opt)
        }
      }

      input.id = inputId
      input.dataset.key = field.key
      wrapper.appendChild(input)
    }

    if (field.help) {
      const help = document.createElement('small')
      help.className = 'field-help'
      help.textContent = field.help
      wrapper.appendChild(help)
    }

    const onInput = () => {
      applyInputValue(field, input)
      scheduleRefresh()
    }
    input.addEventListener('input', onInput)
    input.addEventListener('change', onInput)

    applyStateToInput(field, input)
    return { wrapper, input, field }
  }

  function seedState (initialState) {
    for (const [key, value] of Object.entries(initialState || {})) {
      state[key] = Array.isArray(value) ? value.slice() : value
    }
  }

  function render () {
    if (!manifest) return
    app.innerHTML = ''
    fieldRegistry.clear()

    for (const section of manifest.sections) {
      const card = document.createElement('section')
      card.className = 'card'

      const title = document.createElement('h2')
      title.textContent = section.label
      card.appendChild(title)

      const description = document.createElement('p')
      description.textContent = section.description
      card.appendChild(description)

      for (const field of section.fields) {
        const node = createFieldNode(field)
        fieldRegistry.set(field.key, node)
        card.appendChild(node.wrapper)
      }

      app.appendChild(card)
    }

    updateFieldVisibility()
  }

  function updateFieldVisibility () {
    if (!manifest) return
    for (const section of manifest.sections) {
      for (const field of section.fields) {
        const node = fieldRegistry.get(field.key)
        if (!node) continue
        const shown = visible(field)
        node.wrapper.hidden = !shown
      }
    }
  }

  async function updateCommand () {
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      })
      const payload = await response.json()
      if (!response.ok) {
        setStatus(
          (payload.errors || ['Command validation failed.']).join(' '),
          'warn'
        )
        commandEl.textContent = ''
        return
      }
      commandEl.textContent = payload.command
      setStatus('Command ready.', 'ok')
    } catch (error) {
      setStatus(`Unable to build command: ${error.message}`, 'warn')
      commandEl.textContent = ''
    }
  }

  function scheduleRefresh () {
    updateFieldVisibility()
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(updateCommand, 75)
  }

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(commandEl.textContent || '')
      setStatus('Command copied to clipboard.', 'ok')
    } catch (error) {
      setStatus(`Copy failed: ${error.message}`, 'warn')
    }
  })

  fetch('/api/bootstrap')
    .then((response) => response.json())
    .then((payload) => {
      manifest = payload.manifest
      seedState(payload.initialState || {})
      render()
      commandEl.textContent = payload.command || ''
      setStatus('Ready.', 'ok')
    })
    .catch((error) => {
      setStatus(`Failed to load UI bootstrap: ${error.message}`, 'warn')
    })
})()
